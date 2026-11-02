import { useSyncExternalStore } from 'react';
import {
  type DevicePermit,
  type DeviceSpecies,
  type QueuedCatch,
  type WaterRules,
  deviceDb,
} from './db';
import { getDeviceRefresh, subscribeDeviceRefresh } from './device-data';
import { useLiveQuery } from './use-live-query';

export interface DeviceData {
  permits: DevicePermit[];
  /** The rules of the waters of each permit, by permit id. */
  rules: Map<string, WaterRules[]>;
  species: DeviceSpecies[];
}

/**
 * What the device holds for `userId`; `undefined` while it is read or the user is not known
 * yet, `null` when the device holds nothing of this user (another user's data is never shown).
 */
export function useDeviceData(userId: string | undefined): DeviceData | null | undefined {
  return useLiveQuery(
    async () => {
      if (userId === undefined) {
        return undefined;
      }
      const owner = await deviceDb.meta.get('owner');
      if (owner?.userId !== userId) {
        return null;
      }
      const [permits, rules, species] = await Promise.all([
        deviceDb.permits.toArray(),
        deviceDb.rules.toArray(),
        deviceDb.species.toArray(),
      ]);
      return {
        permits,
        rules: new Map(rules.map((row) => [row.permitId, row.waterRules])),
        species,
      };
    },
    `device:${userId ?? ''}`,
  );
}

/** The user's catches on the device: waiting, refused, and those with a recent verdict. */
export function useQueuedCatches(userId: string | undefined): QueuedCatch[] | undefined {
  const rows = useLiveQuery(
    async () =>
      userId === undefined
        ? undefined
        : deviceDb.catchQueue.filter((row) => row.userId === userId).toArray(),
    `queue:${userId ?? ''}`,
  );
  return rows ?? (rows === null ? [] : undefined);
}

/** One catch of the queue, as its verdict arrives. */
export function useQueuedCatch(clientId: string | null): QueuedCatch | null | undefined {
  return useLiveQuery(
    async () => (clientId === null ? null : ((await deviceDb.catchQueue.get(clientId)) ?? null)),
    `catch:${clientId ?? ''}`,
  );
}

/** The last refresh of the device's data: running, done, or failed with its error. */
export function useDeviceRefresh() {
  return useSyncExternalStore(subscribeDeviceRefresh, getDeviceRefresh);
}
