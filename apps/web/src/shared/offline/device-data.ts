import { type DateOnly, addDays, warsawDate } from '@lowisko/shared';
import { api, request } from '../api/client';
import { type DevicePermit, deviceDb } from './db';
import { syncCatchQueue } from './catch-queue';

/**
 * Permits the device keeps: valid now or later, and the one that ended yesterday — a catch
 * of yesterday can still be recorded on it (BR-01 is checked at `caughtAt`, BR-07).
 */
export function keptOnDevice(permit: DevicePermit, today: DateOnly): boolean {
  return (
    permit.status === 'ACTIVE' ||
    permit.status === 'SCHEDULED' ||
    (permit.status === 'EXPIRED' && permit.validTo >= addDays(today, -1))
  );
}

/**
 * Replaces what the device holds with the logged-in user's permits, their rules and species
 * (docs/06-frontend.md → «Офлайн», step 1); returns the user's id. Not screen data, so it calls
 * the API client without TanStack Query. Another user's permits never stay next to these.
 */
export async function refreshDeviceData(now: Date): Promise<string> {
  const [me, permits, species] = await Promise.all([
    request(() => api.GET('/api/v1/me')),
    request(() => api.GET('/api/v1/me/permits')),
    request(() => api.GET('/api/v1/species')),
  ]);
  const today = warsawDate(now);
  const bundles = await Promise.all(
    permits
      .filter((permit) => keptOnDevice(permit, today))
      .map(({ id }) =>
        request(() =>
          api.GET('/api/v1/me/permits/{id}/offline-bundle', { params: { path: { id } } }),
        ),
      ),
  );
  const { meta, rules } = deviceDb;
  await deviceDb.transaction('rw', [meta, deviceDb.permits, rules, deviceDb.species], async () => {
    await Promise.all([deviceDb.permits.clear(), rules.clear(), deviceDb.species.clear()]);
    await deviceDb.permits.bulkPut(bundles.map((bundle) => bundle.permit));
    await rules.bulkPut(
      bundles.map((bundle) => ({ permitId: bundle.permit.id, waterRules: bundle.waterRules })),
    );
    await deviceDb.species.bulkPut(species);
    await meta.put({ key: 'owner', userId: me.id, refreshedAt: now.toISOString() });
  });
  return me.id;
}

export type DeviceRefresh =
  { status: 'idle' | 'running' | 'done' } | { status: 'failed'; error: unknown };

let refresh: DeviceRefresh = { status: 'idle' };
let pendingCycle: Promise<void> | null = null;
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
 * back: fresh permits and rules on the device, then the waiting catches to the server.
 * Concurrent callers share one run.
 */
export function refreshAndSync(): Promise<void> {
  pendingCycle ??= (async () => {
    setRefresh({ status: 'running' });
    try {
      const userId = await refreshDeviceData(new Date());
      setRefresh({ status: 'done' });
      await syncCatchQueue(userId);
    } catch (error) {
      setRefresh({ status: 'failed', error });
    } finally {
      pendingCycle = null;
    }
  })();
  return pendingCycle;
}

/** Test helper: back to a fresh page load. */
export function resetDeviceRefreshForTests(): void {
  refresh = { status: 'idle' };
  pendingCycle = null;
  listeners.clear();
}
