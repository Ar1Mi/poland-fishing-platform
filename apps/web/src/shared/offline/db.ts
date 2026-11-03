import Dexie, { type EntityTable } from 'dexie';
import type { components } from '../api/schema';

// What the angler's device keeps to work without network (ADR-0009, docs/06-frontend.md →
// «Офлайн»): permits with their QR, the rules of their waters, species, and the queue of catches.

export type DevicePermit = components['schemas']['MyPermitDto'];
export type DeviceSpecies = components['schemas']['SpeciesDto'];
export type WaterRules = components['schemas']['OfflineWaterRulesDto'];
export type QueuedItem = components['schemas']['SyncCatchItemDto'];
export type QueuedViolation = components['schemas']['RuleViolationDto'];

/** Whose permits, rules and species the device holds, and when they were last fetched online. */
export interface DeviceOwner {
  key: 'owner';
  userId: string;
  /** Instant (ISO) of the last refresh: the offline session lasts a while from it. */
  refreshedAt: string;
}

/** The effective rules of the waters of one permit (`GET /me/permits/:id/offline-bundle`). */
export interface DeviceRules {
  permitId: string;
  waterRules: WaterRules[];
}

/**
 * A catch recorded on this device: waiting for the server (`PENDING_SYNC`), its verdict, or
 * `FAILED` — refused as a whole (400), so it will never be stored and only waits to be removed.
 */
export type QueueStatus = 'PENDING_SYNC' | 'ACCEPTED' | 'REJECTED' | 'FAILED';

export interface QueuedCatch {
  clientId: string;
  /** Rows of another user wait for them: they are sent only with that user's session. */
  userId: string;
  item: QueuedItem;
  status: QueueStatus;
  /** The server's id of the stored catch. */
  id: string | null;
  violations: QueuedViolation[];
  /** The code of the refusal of a FAILED row. */
  errorCode: string | null;
  createdAt: string;
  /** When it was last sent: without an answer the server may have stored it. */
  sentAt: string | null;
}

export class DeviceDatabase extends Dexie {
  meta!: EntityTable<DeviceOwner, 'key'>;
  permits!: EntityTable<DevicePermit, 'id'>;
  rules!: EntityTable<DeviceRules, 'permitId'>;
  species!: EntityTable<DeviceSpecies, 'id'>;
  catchQueue!: EntityTable<QueuedCatch, 'clientId'>;

  constructor() {
    super('lowisko');
    // The names of waters come with the permits (`waters`), so there is no table of them.
    this.version(1).stores({
      meta: 'key',
      permits: 'id',
      rules: 'permitId',
      species: 'id',
      catchQueue: 'clientId, [userId+status]',
    });
  }
}

export const deviceDb = new DeviceDatabase();

/** How long the device acts for its last user without the server: the refresh cookie's life. */
export const OFFLINE_SESSION_DAYS = 7;

/**
 * The user whose data the device holds, if it was refreshed online within the last
 * `OFFLINE_SESSION_DAYS`; `null` without such data or when IndexedDB is not available.
 */
export async function recentDeviceOwner(now: Date): Promise<string | null> {
  try {
    const owner = await deviceDb.meta.get('owner');
    const age = owner ? now.getTime() - Date.parse(owner.refreshedAt) : Infinity;
    return owner && age >= 0 && age < OFFLINE_SESSION_DAYS * 86_400_000 ? owner.userId : null;
  } catch {
    return null;
  }
}

/**
 * After the refresh cookie is refused (401): the device stops acting for its owner offline
 * (ADR-0013) and drops their permits; unsent catches wait for the owner's next login.
 */
export async function forgetDeviceOwner(): Promise<void> {
  const { meta, permits, rules, species } = deviceDb;
  await deviceDb.transaction('rw', [meta, permits, rules, species], async () => {
    await Promise.all([meta.clear(), permits.clear(), rules.clear(), species.clear()]);
  });
}

/** After logout: the user's permits, rules and unsent catches leave the device. */
export async function clearDeviceData(userId: string): Promise<void> {
  const { meta, permits, rules, species, catchQueue } = deviceDb;
  await deviceDb.transaction('rw', [meta, permits, rules, species, catchQueue], async () => {
    const owner = await meta.get('owner');
    if (owner?.userId === userId) {
      await Promise.all([meta.clear(), permits.clear(), rules.clear(), species.clear()]);
    }
    await catchQueue.filter((row) => row.userId === userId).delete();
  });
}
