import { isCatchEditable } from '@lowisko/shared';
import { api, request } from '../api/client';
import { ApiError } from '../api/errors';
import { type QueuedCatch, type QueuedItem, deviceDb } from './db';

/** Catches per `POST /catches/sync` (docs/06-frontend.md; the API takes up to 100). */
export const SYNC_BATCH_SIZE = 50;

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
  });
}

/**
 * Removes a catch the server does not have: waiting to be sent or refused. A stored one is
 * deleted on the server, within the BR-07 window (the register).
 */
export async function removeQueued(clientId: string): Promise<void> {
  await deviceDb.catchQueue
    .where('clientId')
    .equals(clientId)
    .filter((row) => row.status === 'PENDING_SYNC' || row.status === 'FAILED')
    .delete();
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

const running = new Map<string, Promise<SyncOutcome>>();

/**
 * Sends the user's waiting catches, oldest catch first, in batches of `SYNC_BATCH_SIZE`.
 * Concurrent callers share one run: two runs would send the same catches twice (harmless —
 * `clientId` makes it idempotent — but wasted).
 */
export function syncCatchQueue(userId: string): Promise<SyncOutcome> {
  let run = running.get(userId);
  if (!run) {
    run = sync(userId).finally(() => running.delete(userId));
    running.set(userId, run);
  }
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
  const { results } = await request(() =>
    api.POST('/api/v1/catches/sync', { body: { items: batch.map((row) => row.item) } }),
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
 * The server refused the catches as input (4xx) and would refuse them again. A missing
 * answer, a server error, an expired session or a rate limit are worth another try.
 */
function isRefusal(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
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
