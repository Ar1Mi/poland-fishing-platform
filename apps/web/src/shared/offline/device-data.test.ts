import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi } from '../../test/render';
import { startSession } from '../auth/session';
import { enqueueCatch } from './catch-queue';
import { type DevicePermit, deviceDb } from './db';
import { getDeviceRefresh, refreshAndSync, refreshDeviceData } from './device-data';

const USER = '6f1c2c9e-0000-4000-8000-000000000001';
const LAKE = { id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e61', name: 'Zalew Zegrzyński' };
const PIKE = {
  id: '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e61',
  latinName: 'Esox lucius',
  namePl: 'Szczupak',
  nameEn: 'Pike',
  nameRu: 'Щука',
  isProtected: false,
};

const permit = (n: number, changes: Partial<DevicePermit>): DevicePermit => ({
  id: `5e1c2c9e-0000-4000-8000-${String(n).padStart(12, '0')}`,
  number: `ZW-2026-00000${n}`,
  status: 'ACTIVE',
  validFrom: '2026-10-01',
  validTo: '2026-10-31',
  pricePaidGrosze: 9000,
  permitType: {
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Miesięczne',
    durationDays: 31,
    discountKind: 'NONE',
  },
  organization: { id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13', name: 'Koło PZW 7' },
  waters: [LAKE],
  createdAt: '2026-10-01T10:00:00.000Z',
  qrToken: 'header.payload.signature',
  ...changes,
});

const active = permit(1, {});
const scheduled = permit(2, {
  status: 'SCHEDULED',
  validFrom: '2026-11-01',
  validTo: '2026-11-30',
});
// 6 October is today: yesterday's catches may still be recorded on it.
const endedYesterday = permit(3, {
  status: 'EXPIRED',
  validFrom: '2026-10-05',
  validTo: '2026-10-05',
  qrToken: null,
});
const endedBefore = permit(4, {
  status: 'EXPIRED',
  validFrom: '2026-10-04',
  validTo: '2026-10-04',
  qrToken: null,
});
const unpaid = permit(5, { status: 'PENDING_PAYMENT', qrToken: null });
const pikeRule = {
  speciesId: PIKE.id,
  minLengthCm: 50,
  dailyLimitCount: 2,
  dailyLimitWeightG: null,
  closedPeriods: [{ from: '01-01', to: '04-30' }],
};

const api = (userId = USER) => ({
  'GET /api/v1/me': () => jsonResponse({ id: userId, firstName: 'Jan' }),
  'GET /api/v1/me/permits': () =>
    jsonResponse([scheduled, active, endedYesterday, endedBefore, unpaid]),
  'GET /api/v1/species': () => jsonResponse([PIKE]),
  ...Object.fromEntries(
    [active, scheduled, endedYesterday].map((item) => [
      `GET /api/v1/me/permits/${item.id}/offline-bundle`,
      () => jsonResponse({ permit: item, waterRules: [{ waterId: LAKE.id, rules: [pikeRule] }] }),
    ]),
  ),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 6 October 2026, 17:20 in Warsaw.
  vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
  startSession('access-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('device data', () => {
  it('keeps the permits valid now or later and the one that ended yesterday, with their rules', async () => {
    mockApi(api());

    expect(await refreshDeviceData(new Date())).toBe(USER);

    const ids = (await deviceDb.permits.toArray()).map(({ id }) => id).sort();
    expect(ids).toEqual([active.id, scheduled.id, endedYesterday.id].sort());
    expect(await deviceDb.rules.get(active.id)).toEqual({
      permitId: active.id,
      waterRules: [{ waterId: LAKE.id, rules: [pikeRule] }],
    });
    expect(await deviceDb.species.toArray()).toEqual([PIKE]);
    expect(await deviceDb.meta.get('owner')).toEqual({
      key: 'owner',
      userId: USER,
      refreshedAt: '2026-10-06T15:20:00.000Z',
    });
  });

  it("replaces another user's permits, but keeps their unsent catches for them", async () => {
    const before = '6f1c2c9e-0000-4000-8000-000000000009';
    await deviceDb.meta.put({ key: 'owner', userId: before, refreshedAt: '2026-10-05T10:00:00Z' });
    await deviceDb.permits.put(permit(9, {}));
    await enqueueCatch(
      before,
      {
        clientId: '8b000000-0000-4000-8000-000000000001',
        permitId: permit(9, {}).id,
        externalPermitId: null,
        fishingWaterId: LAKE.id,
        speciesId: PIKE.id,
        caughtAt: '2026-10-05T08:00:00.000Z',
        lengthCm: 60,
        weightG: null,
        kept: true,
        lat: null,
        lng: null,
      },
      new Date(),
    );
    mockApi(api());

    await refreshDeviceData(new Date());

    expect(await deviceDb.permits.get(permit(9, {}).id)).toBeUndefined();
    expect(await deviceDb.catchQueue.count()).toBe(1);
  });

  it('leaves the device as it was when a request fails', async () => {
    await deviceDb.permits.put(active);
    mockApi({
      ...api(),
      [`GET /api/v1/me/permits/${scheduled.id}/offline-bundle`]: () =>
        jsonResponse({ code: 'INTERNAL_ERROR', message: 'Internal error' }, 500),
    });

    await expect(refreshDeviceData(new Date())).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(await deviceDb.permits.toArray()).toEqual([active]);
    expect(await deviceDb.meta.get('owner')).toBeUndefined();
  });

  it('reports a refresh that failed, with its error', async () => {
    mockApi({
      ...api(),
      'GET /api/v1/me/permits': () =>
        jsonResponse({ code: 'INTERNAL_ERROR', message: 'Internal error' }, 500),
    });

    await refreshAndSync();

    expect(getDeviceRefresh()).toMatchObject({
      status: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('refreshes, then sends the waiting catches', async () => {
    const clientId = '8b000000-0000-4000-8000-000000000001';
    await enqueueCatch(
      USER,
      {
        clientId,
        permitId: active.id,
        externalPermitId: null,
        fishingWaterId: LAKE.id,
        speciesId: PIKE.id,
        caughtAt: '2026-10-06T08:00:00.000Z',
        lengthCm: 60,
        weightG: null,
        kept: true,
        lat: null,
        lng: null,
      },
      new Date(),
    );
    mockApi({
      ...api(),
      'POST /api/v1/catches/sync': () =>
        jsonResponse({
          results: [
            {
              clientId,
              id: '9a000000-0000-4000-8000-000000000001',
              status: 'ACCEPTED',
              violations: [],
            },
          ],
        }),
    });

    await refreshAndSync();

    expect(getDeviceRefresh()).toEqual({ status: 'done' });
    expect(await deviceDb.catchQueue.get(clientId)).toMatchObject({ status: 'ACCEPTED' });
  });
});
