import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../test/render';
import { api, request } from '../api/client';
import { deviceDb } from '../offline/db';
import {
  getAccessToken,
  getCarriedUserId,
  getOfflineUserId,
  getSessionStatus,
  refreshSession,
  resetSessionForTests,
  restoreSession,
  startSession,
} from './session';

const sentRequest = (fetch: ReturnType<typeof vi.fn>, call: number) =>
  fetch.mock.calls[call]?.[0] as Request;

const getMe = () => request(() => api.GET('/api/v1/me'));

describe('session', () => {
  afterEach(() => {
    resetSessionForTests();
  });

  it('restores the session from the refresh cookie on start', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'access-1' }));
    vi.stubGlobal('fetch', fetch);

    await restoreSession();

    expect(getSessionStatus()).toBe('authenticated');
    expect(getAccessToken()).toBe('access-1');
    expect(sentRequest(fetch, 0).url).toBe(`${location.origin}/api/v1/auth/refresh`);
    expect(sentRequest(fetch, 0).method).toBe('POST');
  });

  it('becomes a guest when there is no valid refresh cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401)),
    );

    await restoreSession();

    expect(getSessionStatus()).toBe('guest');
    expect(getAccessToken()).toBeNull();
  });

  it('becomes a guest when the API cannot be reached on start', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await restoreSession();

    expect(getSessionStatus()).toBe('guest');
  });

  describe('without network on start', () => {
    const USER = '6f1c2c9e-0000-4000-8000-000000000001';
    const unreachable = () => vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    afterEach(() => {
      vi.useRealTimers();
    });

    it('acts offline for the user whose permits the device holds', async () => {
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: new Date().toISOString(),
      });
      vi.stubGlobal('fetch', unreachable());

      await restoreSession();

      expect(getSessionStatus()).toBe('offline');
      expect(getOfflineUserId()).toBe(USER);
      expect(getAccessToken()).toBeNull();
    });

    it('also when the API fails, since recording a catch needs only the device', async () => {
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: new Date().toISOString(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ code: 'INTERNAL_ERROR', message: 'x' }, 500)),
      );

      await restoreSession();

      expect(getSessionStatus()).toBe('offline');
    });

    it('is a guest when the device was last refreshed longer ago than a refresh cookie lives', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-08T10:00:00.000Z'));
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: '2026-10-01T10:00:00.000Z',
      });
      vi.stubGlobal('fetch', unreachable());

      await restoreSession();

      expect(getSessionStatus()).toBe('guest');
    });

    it('is a guest when the refresh cookie is refused, whatever the device holds', async () => {
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: new Date().toISOString(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401)),
      );

      await restoreSession();

      expect(getSessionStatus()).toBe('guest');
    });

    it('stops acting offline once the refresh cookie has been refused', async () => {
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: new Date().toISOString(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401)),
      );
      await restoreSession();
      // The next start, without network.
      resetSessionForTests();
      vi.stubGlobal('fetch', unreachable());

      await restoreSession();

      expect(getSessionStatus()).toBe('guest');
      expect(await deviceDb.meta.get('owner')).toBeUndefined();
    });

    it('does not carry the offline user into a login', async () => {
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: new Date().toISOString(),
      });
      vi.stubGlobal('fetch', unreachable());
      await restoreSession();

      startSession('access-of-someone');

      expect(getSessionStatus()).toBe('authenticated');
      expect(getCarriedUserId()).toBeNull();
    });

    it('becomes a real session when the network comes back', async () => {
      await deviceDb.meta.put({
        key: 'owner',
        userId: USER,
        refreshedAt: new Date().toISOString(),
      });
      vi.stubGlobal('fetch', unreachable());
      await restoreSession();
      const fetch = vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'access-3' }));
      vi.stubGlobal('fetch', fetch);

      globalThis.dispatchEvent(new Event('online'));

      await vi.waitFor(() => expect(getSessionStatus()).toBe('authenticated'));
      expect(getAccessToken()).toBe('access-3');
      expect(getOfflineUserId()).toBeNull();
      // Still the same user while their profile loads.
      expect(getCarriedUserId()).toBe(USER);
    });
  });

  it('shares one refresh request between concurrent callers', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'access-2' }));
    vi.stubGlobal('fetch', fetch);

    const tokens = await Promise.all([refreshSession(), refreshSession(), restoreSession()]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(tokens.slice(0, 2)).toEqual(['access-2', 'access-2']);
  });

  it('sends the access token with API requests', async () => {
    startSession('access-1');
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 'u1' }));
    vi.stubGlobal('fetch', fetch);

    await getMe();

    expect(sentRequest(fetch, 0).headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('refreshes an expired access token once and repeats the request', async () => {
    startSession('expired');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'TOKEN_EXPIRED', message: 'x' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'u1' }));
    vi.stubGlobal('fetch', fetch);

    await expect(getMe()).resolves.toEqual({ id: 'u1' });

    expect(sentRequest(fetch, 1).url).toBe(`${location.origin}/api/v1/auth/refresh`);
    expect(sentRequest(fetch, 2).headers.get('Authorization')).toBe('Bearer fresh');
    expect(getAccessToken()).toBe('fresh');
  });

  it('ends the session when the refresh is refused', async () => {
    startSession('expired');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ code: 'TOKEN_EXPIRED', message: 'x' }, 401))
        .mockResolvedValueOnce(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401)),
    );

    await expect(getMe()).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });

    expect(getSessionStatus()).toBe('guest');
  });

  it('keeps the session when the refresh fails for a reason other than 401', async () => {
    startSession('expired');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ code: 'TOKEN_EXPIRED', message: 'x' }, 401))
        .mockResolvedValueOnce(new Response(null, { status: 502 })),
    );

    await expect(getMe()).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });

    expect(getSessionStatus()).toBe('authenticated');
  });

  it('does not refresh when an expired email link answers TOKEN_EXPIRED', async () => {
    startSession('access-1');
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'TOKEN_EXPIRED', message: 'x' }, 401));
    vi.stubGlobal('fetch', fetch);

    await expect(
      request(() => api.POST('/api/v1/auth/verify-email', { body: { token: 'old' } })),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getSessionStatus()).toBe('authenticated');
  });

  it('does not refresh after a failed login', async () => {
    startSession('access-1');
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401));
    vi.stubGlobal('fetch', fetch);

    await expect(
      request(() => api.POST('/api/v1/auth/login', { body: { email: 'a@b.pl', password: 'x' } })),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when a password confirmation is wrong', async () => {
    startSession('access-1');
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401));
    vi.stubGlobal('fetch', fetch);

    await expect(
      request(() => api.DELETE('/api/v1/me', { body: { password: 'wrong' } })),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getSessionStatus()).toBe('authenticated');
  });
});
