import { describe, expect, it } from 'vitest';
import type { DeviceExternalPermit, DevicePermit, QueuedCatch } from '../../../shared/offline/db';
import type { DeviceData } from '../../../shared/offline/use-device';
import type { Catch } from '../api/useCatches';
import { checkOnDevice, recordablePermits, sameDayKeptOf } from './device-check';

const LAKE = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e61';
const RIVER = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e62';
const PIKE = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e61';
const STURGEON = '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e62';
// 6 October 2026, 17:20 in Warsaw.
const NOW = new Date('2026-10-06T15:20:00.000Z');

const permit = (changes: Partial<DevicePermit> = {}): DevicePermit => ({
  id: '5e1c2c9e-0000-4000-8000-000000000101',
  number: 'ZW-2026-000121',
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
  waters: [
    { id: LAKE, name: 'Zalew Zegrzyński' },
    { id: RIVER, name: 'Narew' },
  ],
  createdAt: '2026-10-01T10:00:00.000Z',
  qrToken: 'token',
  ...changes,
});

const external = (changes: Partial<DeviceExternalPermit> = {}): DeviceExternalPermit => ({
  id: '7e1c2c9e-0000-4000-8000-000000000201',
  issuerName: 'Gospodarstwo Rybackie Wąsosze',
  number: null,
  status: 'ACTIVE',
  validFrom: '2026-05-01',
  validTo: '2026-12-31',
  waters: [{ id: LAKE, name: 'Zalew Zegrzyński' }],
  photoType: null,
  createdAt: '2026-05-01T10:00:00.000Z',
  ...changes,
});

const species = (id: string, isProtected = false) => ({
  id,
  latinName: 'Latin',
  namePl: 'Ryba',
  nameEn: 'Fish',
  nameRu: 'Рыба',
  isProtected,
});

const device = (rules: DeviceData['rules']): DeviceData => ({
  permits: [permit()],
  externalPermits: [external()],
  rules,
  species: [species(PIKE), species(STURGEON, true)],
});

const pike = { speciesId: PIKE, fishingWaterId: RIVER, lengthCm: 60, weightG: null, kept: true };
const at = (iso: string) => new Date(iso);

describe('recordablePermits', () => {
  it('offers the permits active now and the one that ended yesterday', () => {
    const ids = recordablePermits(
      {
        externalPermits: [],
        permits: [
          permit({ id: 'active' }),
          permit({
            id: 'yesterday',
            status: 'EXPIRED',
            validFrom: '2026-10-05',
            validTo: '2026-10-05',
          }),
          permit({
            id: 'older',
            status: 'EXPIRED',
            validFrom: '2026-10-04',
            validTo: '2026-10-04',
          }),
          permit({ id: 'revoked', status: 'REVOKED' }),
          permit({
            id: 'tomorrow',
            status: 'SCHEDULED',
            validFrom: '2026-10-07',
            validTo: '2026-10-07',
          }),
        ],
      },
      NOW,
    ).map(({ id }) => id);

    expect(ids).toEqual(['active', 'yesterday']);
  });

  it('offers on 1 January the permit that ended on 31 December', () => {
    const lastYear = permit({
      status: 'ACTIVE',
      validFrom: '2026-12-01',
      validTo: '2026-12-31',
    });
    // 1 January 2027, 00:30 in Warsaw (23:30 UTC on 31 December).
    const newYear = new Date('2026-12-31T23:30:00.000Z');

    const permits = { permits: [lastYear], externalPermits: [] };

    expect(recordablePermits(permits, newYear)).toMatchObject([
      { id: lastYear.id, status: 'EXPIRED', validTo: '2026-12-31' },
    ]);
    // A day later it is gone.
    expect(recordablePermits(permits, new Date('2027-01-01T23:30:00.000Z'))).toEqual([]);
  });

  it('turns a permit fetched as scheduled active when its first day comes without network', () => {
    const fetchedYesterday = permit({
      status: 'SCHEDULED',
      validFrom: '2026-10-06',
      validTo: '2026-10-06',
    });

    expect(
      recordablePermits({ permits: [fetchedYesterday], externalPermits: [] }, NOW),
    ).toMatchObject([{ id: fetchedYesterday.id, status: 'ACTIVE' }]);
  });

  it('offers external permits by their dates, named by the issuer', () => {
    const permits = recordablePermits(
      {
        permits: [],
        externalPermits: [
          // Fetched as scheduled: it starts today.
          external({ id: 'today', status: 'SCHEDULED', validFrom: '2026-10-06' }),
          external({ id: 'yesterday', validFrom: '2026-10-01', validTo: '2026-10-05' }),
          external({ id: 'older', status: 'EXPIRED', validTo: '2026-10-04' }),
          external({ id: 'tomorrow', status: 'SCHEDULED', validFrom: '2026-10-07' }),
        ],
      },
      NOW,
    );

    expect(permits.map(({ id, external, name, status }) => [id, external, name, status])).toEqual([
      ['today', true, 'Gospodarstwo Rybackie Wąsosze', 'ACTIVE'],
      ['yesterday', true, 'Gospodarstwo Rybackie Wąsosze', 'EXPIRED'],
    ]);
  });
});

describe('sameDayKeptOf', () => {
  const onServer = (changes: Partial<Catch>): Catch => ({
    id: '9a000000-0000-4000-8000-000000000001',
    clientId: '8b000000-0000-4000-8000-000000000001',
    permitId: permit().id,
    externalPermitId: null,
    water: { id: LAKE, name: 'Zalew Zegrzyński' },
    speciesId: PIKE,
    caughtAt: '2026-10-06T08:00:00.000Z',
    lengthCm: 60,
    weightG: 2000,
    kept: true,
    lat: null,
    lng: null,
    status: 'ACCEPTED',
    violations: [],
    editableUntil: '2026-10-07T22:00:00.000Z',
    createdAt: '2026-10-06T08:01:00.000Z',
    ...changes,
  });
  const queued = (clientId: string, status: QueuedCatch['status'], kept = true): QueuedCatch => ({
    clientId,
    userId: 'user',
    item: {
      clientId,
      permitId: permit().id,
      externalPermitId: null,
      fishingWaterId: RIVER,
      speciesId: PIKE,
      caughtAt: '2026-10-06T09:00:00.000Z',
      lengthCm: 55,
      weightG: null,
      kept,
      lat: null,
      lng: null,
    },
    status,
    id: null,
    violations: [],
    errorCode: null,
    createdAt: '2026-10-06T09:00:00.000Z',
    sentAt: null,
  });

  it('counts kept catches accepted on the server and those still waiting on the device', () => {
    const kept = sameDayKeptOf(
      [
        onServer({}),
        onServer({ clientId: 'released', kept: false }),
        onServer({ clientId: 'rejected', status: 'REJECTED' }),
      ],
      [
        queued('waiting', 'PENDING_SYNC'),
        queued('failed', 'FAILED'),
        queued('rejected-here', 'REJECTED'),
        queued('released-here', 'PENDING_SYNC', false),
      ],
    );

    expect(kept).toEqual([
      { speciesId: PIKE, caughtAt: at('2026-10-06T08:00:00.000Z'), weightG: 2000, kept: true },
      { speciesId: PIKE, caughtAt: at('2026-10-06T09:00:00.000Z'), weightG: null, kept: true },
    ]);
  });

  it('does not count a catch deleted in the register that the device still holds as accepted', () => {
    // Deleted on the server (a wrong permit, recorded again): the register no longer has it.
    expect(sameDayKeptOf([], [queued('deleted', 'ACCEPTED')])).toEqual([]);
  });

  it('counts a catch of this device once when the server has it too', () => {
    const kept = sameDayKeptOf([onServer({ clientId: 'synced' })], [queued('synced', 'ACCEPTED')]);

    expect(kept).toHaveLength(1);
  });

  it('counts the accepted and waiting catches of the device without the server register', () => {
    expect(
      sameDayKeptOf(undefined, [
        queued('waiting', 'PENDING_SYNC'),
        queued('accepted', 'ACCEPTED'),
        queued('failed', 'FAILED'),
      ]),
    ).toHaveLength(2);
  });
});

describe('checkOnDevice', () => {
  it('checks the catch against the rule of its species on its water, as the server does', () => {
    const rules = new Map([
      [
        permit().id,
        [
          {
            waterId: RIVER,
            rules: [
              {
                speciesId: PIKE,
                minLengthCm: 65,
                dailyLimitCount: 1,
                dailyLimitWeightG: null,
                closedPeriods: [],
              },
            ],
          },
          { waterId: LAKE, rules: [] },
        ],
      ],
    ]);
    const kept = [
      { speciesId: PIKE, caughtAt: at('2026-10-06T06:00:00Z'), weightG: null, kept: true },
    ];

    const violations = checkOnDevice(
      { ...pike, caughtAt: at('2026-10-06T10:00:00Z') },
      permit().id,
      device(rules),
      kept,
      NOW,
    );

    expect(violations.map(({ ruleId, code }) => `${ruleId} ${code}`)).toEqual([
      'BR-02 BELOW_MIN_LENGTH',
      'BR-04 DAILY_COUNT_LIMIT',
    ]);
    // The same fish on the lake, without a rule there, is accepted.
    expect(
      checkOnDevice(
        { ...pike, fishingWaterId: LAKE, caughtAt: at('2026-10-06T10:00:00Z') },
        permit().id,
        device(rules),
        kept,
        NOW,
      ),
    ).toEqual([]);
  });

  it('checks a protected species and the permit at the time of the catch without rules', () => {
    const violations = checkOnDevice(
      { ...pike, speciesId: STURGEON, caughtAt: at('2026-09-30T10:00:00Z') },
      permit().id,
      device(new Map()),
      [],
      NOW,
    );

    expect(violations.map(({ code }) => code)).toEqual(['PERMIT_NOT_ACTIVE', 'PROTECTED_SPECIES']);
    expect(violations[0]!.details).toEqual({
      status: 'SCHEDULED',
      validFrom: '2026-10-01',
      validTo: '2026-10-31',
    });
  });

  it('checks a catch on an external permit against its dates, its waters and its rules', () => {
    const general = new Map([
      [
        external().id,
        [
          {
            waterId: LAKE,
            rules: [
              {
                speciesId: PIKE,
                minLengthCm: 50,
                dailyLimitCount: null,
                dailyLimitWeightG: null,
                closedPeriods: [],
              },
            ],
          },
        ],
      ],
    ]);
    const onLake = { ...pike, fishingWaterId: LAKE, caughtAt: at('2026-10-06T10:00:00Z') };

    expect(checkOnDevice(onLake, external().id, device(general), [], NOW)).toEqual([]);
    expect(
      checkOnDevice({ ...onLake, lengthCm: 45 }, external().id, device(general), [], NOW).map(
        ({ code }) => code,
      ),
    ).toEqual(['BELOW_MIN_LENGTH']);
    // The river is not one of the waters the angler listed; April is before the permit.
    expect(
      checkOnDevice(
        { ...onLake, fishingWaterId: RIVER, caughtAt: at('2026-04-30T10:00:00Z') },
        external().id,
        device(general),
        [],
        NOW,
      ).map(({ code }) => code),
    ).toEqual(['PERMIT_NOT_ACTIVE', 'PERMIT_WATER_MISMATCH']);
  });

  it('leaves a permit the device does not hold to the server', () => {
    expect(
      checkOnDevice(
        { ...pike, caughtAt: at('2026-10-06T10:00:00Z') },
        'unknown',
        device(new Map()),
        [],
        NOW,
      ),
    ).toEqual([]);
  });
});
