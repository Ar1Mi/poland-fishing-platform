import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi } from './render';
import { takeUnexpectedRequests } from './unexpected-requests';

describe('mockApi', () => {
  it('answers a request with the handler of its method and path', async () => {
    mockApi({ 'GET /api/v1/species': () => jsonResponse([]) });

    const response = await fetch(new Request('http://localhost/api/v1/species?lang=pl'));

    expect(await response.json()).toEqual([]);
    expect(takeUnexpectedRequests()).toEqual([]);
  });

  it('fails a request no handler answers and records it for the test to fail', async () => {
    mockApi({ 'GET /api/v1/waters': () => jsonResponse({ items: [], truncated: false }) });

    await expect(
      fetch(new Request('http://localhost/api/v1/waters', { method: 'POST' })),
    ).rejects.toThrow('Unexpected request POST /api/v1/waters');
    await expect(fetch(new Request('http://localhost/api/v1/me'))).rejects.toThrow();

    // Taken here, so the check after this test finds the list empty.
    expect(takeUnexpectedRequests()).toEqual(['POST /api/v1/waters', 'GET /api/v1/me']);
    expect(takeUnexpectedRequests()).toEqual([]);
  });
});
