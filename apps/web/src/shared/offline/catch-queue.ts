import { ErrorCode, isCatchEditable } from '@lowisko/shared';
import { api, request } from '../api/client';
import { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { type QueuedCatch, type QueuedItem, deviceDb } from './db';

type StoredCatch = components['schemas']['CatchDto'];

/** Catches per `POST /catches/sync` (docs/06-frontend.md; the API takes up to 100). */
export const SYNC_BATCH_SIZE = 50;

/** How long a batch waits for its answer before the catches wait for the next sync. */
export const SYNC_TIMEOUT_MS = 20_000;

/** Records a catch on the device, to be sent by the next sync (ADR-0009). */
export async function enqueueCatch(userId: string, item: QueuedItem, now: Date): Promise<void> {
  await deviceDb.catchQueue.add({
    clientId: item.clientId,
    userId,
    item,
    status: 'PENDING_SYNC',
    id: null,
    violations: [],
    errorCode: null,
    createdAt: now.toISOString(),
    sentAt: null,
  });
}

/** Whether a catch may be removed on the device: the server certainly does not have it. */
export function isRemovable(row: QueuedCatch): boolean {
  // A catch sent without an answer may be stored already: it is removed in the register,
  // after the next sync, or the device would forget a catch that counts on the server.
  return row.status === 'FAILED' || (row.status === 'PENDING_SYNC' && !row.sentAt);
}

/** Removes a catch the server does not have: never sent, or refused as input. */
export async function removeQueued(clientId: string): Promise<void> {
  await deviceDb.catchQueue.where('clientId').equals(clientId).filter(isRemovable).delete();
}

/** After a catch is deleted in the register: it no longer counts on the device either. */
export async function forgetQueued(clientId: string): Promise<void> {
  await deviceDb.catchQueue.delete(clientId);
}

/**
 * After a catch is changed in the register: the device counts it as the server stores it
 * (kept or released, species, day), not as it was first sent.
 */
export async function reflectStored(fish: StoredCatch): Promise<void> {
  await deviceDb.catchQueue.update(fish.clientId, (row) => {
    row.item = {
      ...row.item,
      speciesId: fish.speciesId,
      fishingWaterId: fish.water.id,
      caughtAt: fish.caughtAt,
      lengthCm: fish.lengthCm,
      weightG: fish.weightG,
      kept: fish.kept,
    };
    row.status = fish.status;
    row.violations = fish.violations;
  });
}

export interface SyncOutcome {
  /** Catches that got the server's verdict or were refused for good. */
  settled: number;
  /** Why the sync stopped with catches still waiting (network, server, session). */
  error: unknown;
}

const listeners = new Set<(outcome: SyncOutcome) => void>();

/** Called after every sync that settled a catch: the register then reloads. */
export function subscribeSynced(listener: (outcome: SyncOutcome) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Per user: the last run asked for, and a run that has not started yet. */
const lastRun = new Map<string, Promise<SyncOutcome>>();
const nextRun = new Map<string, Promise<SyncOutcome>>();

/**
 * Sends the user's waiting catches, oldest catch first, in batches of `SYNC_BATCH_SIZE`.
 * Runs of a user go one after another. A call during a run gets the next one, which reads the
 * queue after the call, so a catch saved meanwhile is sent too; calls before it starts share it.
 */
export function syncCatchQueue(userId: string): Promise<SyncOutcome> {
  const queued = nextRun.get(userId);
  if (queued) {
    return queued;
  }
  const before = lastRun.get(userId) ?? Promise.resolve();
  const run = before
    .catch(() => undefined)
    .then(() => {
      nextRun.delete(userId);
      return sync(userId);
    });
  nextRun.set(userId, run);
  lastRun.set(userId, run);
  void run
    .finally(() => {
      if (lastRun.get(userId) === run) {
        lastRun.delete(userId);
      }
    })
    .catch(() => undefined);
  return run;
}

async function sync(userId: string): Promise<SyncOutcome> {
  // Before sending: the verdicts of this run stay for the screen that waits for them.
  await forgetClosed(userId, new Date());
  const waiting = await deviceDb.catchQueue
    .where('[userId+status]')
    .equals([userId, 'PENDING_SYNC'])
    .toArray();
  // In the order the server checks a batch, so the daily limits fall the same way.
  waiting.sort(
    (a, b) =>
      Date.parse(a.item.caughtAt) - Date.parse(b.item.caughtAt) ||
      a.clientId.localeCompare(b.clientId),
  );
  let settled = 0;
  let error: unknown = null;
  for (let start = 0; start < waiting.length && error === null; start += SYNC_BATCH_SIZE) {
    const batch = waiting.slice(start, start + SYNC_BATCH_SIZE);
    try {
      settled += await send(batch);
    } catch (failure) {
      if (!isRefusal(failure)) {
        error = failure;
      } else if (batch.length === 1) {
        await markFailed(batch[0]!, failure);
        settled += 1;
      } else {
        // One bad reference refuses the whole batch (docs/05-api.md): find it one by one.
        for (const row of batch) {
          try {
            settled += await send([row]);
          } catch (alone) {
            if (!isRefusal(alone)) {
              error = alone;
              break;
            }
            await markFailed(row, alone);
            settled += 1;
          }
        }
      }
    }
  }
  if (settled > 0) {
    listeners.forEach((listener) => listener({ settled, error }));
  }
  return { settled, error };
}

/** Sends a batch and stores the verdicts; returns how many catches got one. */
async function send(batch: QueuedCatch[]): Promise<number> {
  const sentAt = new Date().toISOString();
  // From now on the server may have them, whatever comes back.
  await deviceDb.catchQueue.bulkUpdate(
    batch.map((row) => ({ key: row.clientId, changes: { sentAt } })),
  );
  const { results } = await request(() =>
    api.POST('/api/v1/catches/sync', {
      body: { items: batch.map((row) => row.item) },
      // A network that only seems to work («lie-fi» at the water) must not hang the screen.
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    }),
  );
  await deviceDb.transaction('rw', deviceDb.catchQueue, async () => {
    for (const result of results) {
      await deviceDb.catchQueue.update(result.clientId, {
        status: result.status,
        id: result.id,
        violations: result.violations,
      });
    }
  });
  return results.length;
}

/**
 * The API refused the catches as input and would refuse them again: the only refusal of a
 * batch in docs/05-api.md. Anything else — no answer, a server error, an expired session, a
 * proxy's 4xx that never reached the API — is worth another try.
 */
function isRefusal(error: unknown): error is ApiError {
  return (
    error instanceof ApiError && error.status === 400 && error.code === ErrorCode.VALIDATION_FAILED
  );
}

async function markFailed(row: QueuedCatch, error: ApiError): Promise<void> {
  await deviceDb.catchQueue.update(row.clientId, { status: 'FAILED', errorCode: error.code });
}

/**
 * Catches with a verdict stay on the device while they may still count towards a daily limit
 * of a catch recorded here (their BR-07 window, today and yesterday); the server keeps them.
 */
async function forgetClosed(userId: string, now: Date): Promise<void> {
  await deviceDb.catchQueue
    .filter(
      (row) =>
        row.userId === userId &&
        (row.status === 'ACCEPTED' || row.status === 'REJECTED') &&
        !isCatchEditable(new Date(row.item.caughtAt), now),
    )
    .delete();
}
