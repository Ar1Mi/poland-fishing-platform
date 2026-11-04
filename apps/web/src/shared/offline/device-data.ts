import { type DateOnly, addDays, warsawDate } from '@lowisko/shared';
import { api, request } from '../api/client';
import { getSessionGeneration } from '../auth/session';
import { deviceDb } from './db';
import { syncCatchQueue } from './catch-queue';

/**
 * Permits the device keeps, platform and external: valid now or later, and the one that ended
 * yesterday — a catch of yesterday can still be recorded on it (BR-01 is checked at `caughtAt`,
 * BR-07).
 */
export function keptOnDevice(
  permit: { status: string; validTo: DateOnly },
  today: DateOnly,
): boolean {
  return (
    permit.status === 'ACTIVE' ||
    permit.status === 'SCHEDULED' ||
    (permit.status === 'EXPIRED' && permit.validTo >= addDays(today, -1))
  );
}

/**
 * Replaces what the device holds with `userId`'s permits, external permits, their rules and
 * species (docs/06-frontend.md → «Офлайн», step 1). Not screen data, so it calls the API client without
 * TanStack Query. Another user's permits never stay next to these. Data fetched for a session
 * that has since ended (logout, another login) is dropped, not written: `generation` is the
 * session's when the work started.
 */
export async function refreshDeviceData(
  userId: string,
  now: Date,
  generation = getSessionGeneration(),
): Promise<void> {
  const [permits, externalPermits, species] = await Promise.all([
    request(() => api.GET('/api/v1/me/permits')),
    request(() => api.GET('/api/v1/me/external-permits')),
    request(() => api.GET('/api/v1/species')),
  ]);
  const today = warsawDate(now);
  const [bundles, externalBundles] = await Promise.all([
    Promise.all(
      permits
        .filter((permit) => keptOnDevice(permit, today))
        .map(({ id }) =>
          request(() =>
            api.GET('/api/v1/me/permits/{id}/offline-bundle', { params: { path: { id } } }),
          ),
        ),
    ),
    Promise.all(
      externalPermits
        .filter((permit) => keptOnDevice(permit, today))
        .map(({ id }) =>
          request(() =>
            api.GET('/api/v1/me/external-permits/{id}/offline-bundle', {
              params: { path: { id } },
            }),
          ),
        ),
    ),
  ]);
  const { meta, rules } = deviceDb;
  const tables = [meta, deviceDb.permits, deviceDb.externalPermits, rules, deviceDb.species];
  await deviceDb.transaction('rw', tables, async () => {
    if (getSessionGeneration() !== generation) {
      return;
    }
    await Promise.all([
      deviceDb.permits.clear(),
      deviceDb.externalPermits.clear(),
      rules.clear(),
      deviceDb.species.clear(),
    ]);
    await deviceDb.permits.bulkPut(bundles.map((bundle) => bundle.permit));
    await deviceDb.externalPermits.bulkPut(externalBundles.map((bundle) => bundle.permit));
    await rules.bulkPut(
      [...bundles, ...externalBundles].map((bundle) => ({
        permitId: bundle.permit.id,
        waterRules: bundle.waterRules,
      })),
    );
    await deviceDb.species.bulkPut(species);
    await meta.put({ key: 'owner', userId, refreshedAt: now.toISOString() });
  });
}

export type DeviceRefresh =
  { status: 'idle' | 'running' | 'done' } | { status: 'failed'; error: unknown };

let refresh: DeviceRefresh = { status: 'idle' };
/** The last cycle asked for, and a cycle that has not started yet. */
let lastCycle: Promise<void> | null = null;
let nextCycle: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setRefresh(next: DeviceRefresh): void {
  refresh = next;
  listeners.forEach((listener) => listener());
}

export function getDeviceRefresh(): DeviceRefresh {
  return refresh;
}

export function subscribeDeviceRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * What the app does online on open, after login and payment and when the network comes
 * back: fresh permits and rules on the device, and the waiting catches to the server — the
 * catches go even when the permits could not be refreshed. Cycles run one after another; a
 * call during a cycle gets the next one (a permit paid meanwhile is fetched), calls before it
 * starts share it.
 */
export function refreshAndSync(): Promise<void> {
  if (nextCycle) {
    return nextCycle;
  }
  const cycle = (lastCycle ?? Promise.resolve()).then(() => {
    nextCycle = null;
    return runCycle();
  });
  nextCycle = cycle;
  lastCycle = cycle;
  void cycle.finally(() => {
    if (lastCycle === cycle) {
      lastCycle = null;
    }
  });
  return cycle;
}

async function runCycle(): Promise<void> {
  const generation = getSessionGeneration();
  setRefresh({ status: 'running' });
  let userId: string | null = null;
  try {
    userId = (await request(() => api.GET('/api/v1/me'))).id;
    await refreshDeviceData(userId, new Date(), generation);
    setRefresh({ status: 'done' });
  } catch (error) {
    setRefresh({ status: 'failed', error });
  }
  // The catches of the user the token belongs to (`/me`), never of a remembered one.
  if (userId !== null && getSessionGeneration() === generation) {
    await syncCatchQueue(userId).catch(() => undefined);
  }
}

/** Test helper: back to a fresh page load. */
export function resetDeviceRefreshForTests(): void {
  refresh = { status: 'idle' };
  lastCycle = null;
  nextCycle = null;
  listeners.clear();
}
