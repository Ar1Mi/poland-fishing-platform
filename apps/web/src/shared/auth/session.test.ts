import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../test/render';
import { api, request } from '../api/client';
import {
  getAccessToken,
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
});
