import { ErrorCode } from '@lowisko/shared';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../test/render';
import { api, request } from './client';
import { ApiError, ClientErrorCode } from './errors';

const healthCheck = () => request(() => api.GET('/api/v1/health'));

describe('request', () => {
  it('returns the data of a successful response', async () => {
    const body = { status: 'ok', time: '2026-10-06T15:20:00.000Z' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

    await expect(healthCheck()).resolves.toEqual(body);
  });

  it('calls the API on the same origin with the /api/v1 prefix', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', time: '' }));
    vi.stubGlobal('fetch', fetch);

    await healthCheck();

    const sent = fetch.mock.calls[0]?.[0] as Request;
    expect(sent.url).toBe(`${location.origin}/api/v1/health`);
  });

  it('throws an ApiError with the code of an API error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'RATE_LIMITED', message: 'Slow down' }, 429)),
    );

    await expect(healthCheck()).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      status: 429,
    });
  });

  it('throws UNKNOWN_ERROR for an error response that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Server Error</html>', { status: 500 })),
    );

    await expect(healthCheck()).rejects.toMatchObject({
      code: ClientErrorCode.UNKNOWN_ERROR,
      status: 500,
    });
  });

  it('throws NETWORK_ERROR when the proxy cannot reach the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 502 })));

    await expect(healthCheck()).rejects.toMatchObject({
      code: ClientErrorCode.NETWORK_ERROR,
      status: 502,
    });
  });

  it('throws NETWORK_ERROR when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error: unknown = await healthCheck().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: ClientErrorCode.NETWORK_ERROR, status: undefined });
  });

  it('rethrows a cancelled request unchanged', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    await expect(healthCheck()).rejects.toBe(abort);
  });
});
