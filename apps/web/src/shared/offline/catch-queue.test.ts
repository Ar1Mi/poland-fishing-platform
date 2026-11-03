import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, sentBodies } from '../../test/render';
import { startSession } from '../auth/session';
import {
  SYNC_BATCH_SIZE,
  enqueueCatch,
  forgetQueued,
  reflectStored,
  removeQueued,
  subscribeSynced,
  syncCatchQueue,
} from './catch-queue';
import { type QueuedItem, deviceDb } from './db';

const USER = '6f1c2c9e-0000-4000-8000-000000000001';
const OTHER_USER = '6f1c2c9e-0000-4000-8000-000000000002';

/** A catch with a clientId ending in `n`, caught `n` minutes after 08:00 UTC on 6 October. */
const item = (n: number, changes: Partial<QueuedItem> = {}): QueuedItem => ({
  clientId: `8b000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  permitId: '5e1c2c9e-0000-4000-8000-000000000101',
  externalPermitId: null,
  fishingWaterId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e61',
  speciesId: '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e61',
  caughtAt: new Date(Date.UTC(2026, 9, 6, 8, n)).toISOString(),
  lengthCm: 50,
  weightG: null,
  kept: true,
  lat: null,
  lng: null,
  ...changes,
});

/** The server stores every catch of the batch as ACCEPTED. */
const acceptAll = async (request: Request) => {
  const { items } = (await request.clone().json()) as { items: QueuedItem[] };
  return jsonResponse({
    results: items.map(({ clientId }, index) => ({
      clientId,
      id: `9a000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      status: 'ACCEPTED',
      violations: [],
    })),
  });
};

const statuses = async () =>
  Object.fromEntries(
    (await deviceDb.catchQueue.toArray()).map((row) => [row.clientId.slice(-2), row.status]),
  );

// 6 October 2026, 17:20 in Warsaw: the catches of the morning are within their BR-07 window.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
  startSession('access-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('catch queue', () => {
  it('sends the waiting catches oldest first in batches and stores the verdicts', async () => {
    for (let n = SYNC_BATCH_SIZE; n >= 0; n--) {
      await enqueueCatch(USER, item(n), new Date());
    }
    const fetch = mockApi({ 'POST /api/v1/catches/sync': acceptAll });

    const outcome = await syncCatchQueue(USER);

    expect(outcome).toEqual({ settled: SYNC_BATCH_SIZE + 1, error: null });
    const bodies = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: QueuedItem[];
    }[];
    expect(bodies.map(({ items }) => items.length)).toEqual([SYNC_BATCH_SIZE, 1]);
    expect(bodies[0]!.items[0]).toEqual(item(0));
    expect(bodies[1]!.items[0]).toEqual(item(SYNC_BATCH_SIZE));
    const row = await deviceDb.catchQueue.get(item(0).clientId);
    expect(row).toMatchObject({ status: 'ACCEPTED', id: '9a000000-0000-4000-8000-000000000000' });
  });

  it('keeps the verdict and the reasons of a rejected catch', async () => {
    await enqueueCatch(USER, item(1), new Date());
    const violations = [
      { code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 55 } },
    ];
    mockApi({
      'POST /api/v1/catches/sync': () =>
        jsonResponse({
          results: [
            {
              clientId: item(1).clientId,
              id: '9a000000-0000-4000-8000-000000000001',
              status: 'REJECTED',
              violations,
            },
          ],
        }),
    });

    await syncCatchQueue(USER);

    expect(await deviceDb.catchQueue.get(item(1).clientId)).toMatchObject({
      status: 'REJECTED',
      violations,
    });
  });

  it('finds the catch a refused batch stumbled on and sends the others', async () => {
    await enqueueCatch(USER, item(1), new Date());
    await enqueueCatch(
      USER,
      item(2, { permitId: '5e1c2c9e-0000-4000-8000-00000000dead' }),
      new Date(),
    );
    await enqueueCatch(USER, item(3), new Date());
    mockApi({
      'POST /api/v1/catches/sync': async (request) => {
        const { items } = (await request.clone().json()) as { items: QueuedItem[] };
        return items.some((sent) => sent.permitId?.endsWith('dead'))
          ? jsonResponse({ code: 'VALIDATION_FAILED', message: 'Request validation failed' }, 400)
          : acceptAll(request);
      },
    });

    const outcome = await syncCatchQueue(USER);

    expect(outcome).toEqual({ settled: 3, error: null });
    expect(await statuses()).toEqual({ '01': 'ACCEPTED', '02': 'FAILED', '03': 'ACCEPTED' });
    expect(await deviceDb.catchQueue.get(item(2).clientId)).toMatchObject({
      errorCode: 'VALIDATION_FAILED',
    });
  });

  it('keeps the catches waiting when the server cannot be reached or fails', async () => {
    await enqueueCatch(USER, item(1), new Date());
    mockApi({
      'POST /api/v1/catches/sync': () =>
        jsonResponse({ code: 'INTERNAL_ERROR', message: 'Internal error' }, 500),
    });

    const outcome = await syncCatchQueue(USER);

    expect(outcome.settled).toBe(0);
    expect(outcome.error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(await statuses()).toEqual({ '01': 'PENDING_SYNC' });
  });

  it('sends only the catches of the given user', async () => {
    await enqueueCatch(USER, item(1), new Date());
    await enqueueCatch(OTHER_USER, item(2), new Date());
    const fetch = mockApi({ 'POST /api/v1/catches/sync': acceptAll });

    await syncCatchQueue(USER);

    const bodies = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: QueuedItem[];
    }[];
    expect(bodies.flatMap(({ items }) => items.map(({ clientId }) => clientId))).toEqual([
      item(1).clientId,
    ]);
    expect(await statuses()).toEqual({ '01': 'ACCEPTED', '02': 'PENDING_SYNC' });
  });

  it('shares one run between concurrent callers', async () => {
    await enqueueCatch(USER, item(1), new Date());
    const fetch = mockApi({ 'POST /api/v1/catches/sync': acceptAll });

    await Promise.all([syncCatchQueue(USER), syncCatchQueue(USER)]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tells the listeners how many catches got a verdict', async () => {
    await enqueueCatch(USER, item(1), new Date());
    mockApi({ 'POST /api/v1/catches/sync': acceptAll });
    const listener = vi.fn();
    const unsubscribe = subscribeSynced(listener);

    await syncCatchQueue(USER);
    unsubscribe();

    expect(listener).toHaveBeenCalledWith({ settled: 1, error: null });
  });

  it('forgets catches with a verdict once their BR-07 window has closed, on the next sync', async () => {
    // 4 October: its window closed at midnight after 5 October.
    await enqueueCatch(USER, item(1, { caughtAt: '2026-10-04T08:00:00.000Z' }), new Date());
    await enqueueCatch(USER, item(2), new Date());
    mockApi({ 'POST /api/v1/catches/sync': acceptAll });

    await syncCatchQueue(USER);
    // The screen that recorded it still shows its verdict.
    expect(await statuses()).toEqual({ '01': 'ACCEPTED', '02': 'ACCEPTED' });
    await syncCatchQueue(USER);

    // The server keeps both; the device only what may still count towards today's limits.
    expect(await statuses()).toEqual({ '02': 'ACCEPTED' });
  });

  it('removes a waiting or refused catch, but not one the server has', async () => {
    await enqueueCatch(USER, item(1), new Date());
    await enqueueCatch(USER, item(2), new Date());
    await deviceDb.catchQueue.update(item(2).clientId, { status: 'ACCEPTED' });

    await removeQueued(item(1).clientId);
    await removeQueued(item(2).clientId);

    expect(await statuses()).toEqual({ '02': 'ACCEPTED' });
  });

  it('sends a catch saved during a run with the run of a later call', async () => {
    await enqueueCatch(USER, item(1), new Date());
    let answerFirst = () => undefined as void;
    const firstAnswered = new Promise<void>((resolve) => {
      answerFirst = resolve;
    });
    let calls = 0;
    const fetch = mockApi({
      'POST /api/v1/catches/sync': async (request) => {
        if (++calls === 1) {
          await firstAnswered;
        }
        return acceptAll(request);
      },
    });

    const first = syncCatchQueue(USER);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // Saved while the first batch is on its way (a slow network).
    await enqueueCatch(USER, item(2), new Date());
    const second = syncCatchQueue(USER);
    answerFirst();
    await Promise.all([first, second]);

    expect(await statuses()).toEqual({ '01': 'ACCEPTED', '02': 'ACCEPTED' });
    const bodies = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: QueuedItem[];
    }[];
    expect(bodies.map(({ items }) => items.map(({ clientId }) => clientId.slice(-2)))).toEqual([
      ['01'],
      ['02'],
    ]);
  });

  it('tries again later what was refused before reaching the API', async () => {
    await enqueueCatch(USER, item(1), new Date());
    // A proxy or firewall answers 403 with its own page: the API never saw the catch.
    mockApi({
      'POST /api/v1/catches/sync': () => new Response('<html>Forbidden</html>', { status: 403 }),
    });

    const outcome = await syncCatchQueue(USER);

    expect(outcome.settled).toBe(0);
    expect(await statuses()).toEqual({ '01': 'PENDING_SYNC' });
  });

  it('keeps a catch sent without an answer: the server may have stored it', async () => {
    await enqueueCatch(USER, item(1), new Date());
    await enqueueCatch(USER, item(2), new Date());
    mockApi({
      'POST /api/v1/catches/sync': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await syncCatchQueue(USER);
    await removeQueued(item(1).clientId);

    expect(await deviceDb.catchQueue.get(item(1).clientId)).toMatchObject({
      status: 'PENDING_SYNC',
      sentAt: '2026-10-06T15:20:00.000Z',
    });
  });

  it('follows the register: a deleted catch leaves the device, a changed one is counted as stored', async () => {
    await enqueueCatch(USER, item(1), new Date());
    await enqueueCatch(USER, item(2), new Date());
    await deviceDb.catchQueue.bulkUpdate([
      { key: item(1).clientId, changes: { status: 'ACCEPTED' } },
      { key: item(2).clientId, changes: { status: 'ACCEPTED' } },
    ]);

    await forgetQueued(item(1).clientId);
    await reflectStored({
      id: '9a000000-0000-4000-8000-000000000002',
      clientId: item(2).clientId,
      permitId: item(2).permitId ?? null,
      externalPermitId: null,
      water: { id: item(2).fishingWaterId, name: 'Narew' },
      speciesId: item(2).speciesId,
      caughtAt: item(2).caughtAt,
      lengthCm: 52,
      weightG: null,
      kept: false,
      lat: null,
      lng: null,
      status: 'ACCEPTED',
      violations: [],
      editableUntil: '2026-10-07T22:00:00.000Z',
      createdAt: '2026-10-06T08:02:00.000Z',
    });

    expect(await deviceDb.catchQueue.get(item(1).clientId)).toBeUndefined();
    expect(await deviceDb.catchQueue.get(item(2).clientId)).toMatchObject({
      item: { kept: false, lengthCm: 52 },
    });
  });
});
