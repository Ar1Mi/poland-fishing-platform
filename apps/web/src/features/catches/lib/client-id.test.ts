import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientId } from './client-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newClientId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives a UUID v4', () => {
    expect(newClientId()).toMatch(UUID_V4);
  });

  it('makes a UUID v4 from random bytes without a secure context', () => {
    const random = globalThis.crypto;
    const getRandomValues = vi.fn((array: Uint8Array<ArrayBuffer>) =>
      random.getRandomValues(array),
    );
    vi.stubGlobal('crypto', { getRandomValues });

    const ids = new Set(Array.from({ length: 50 }, newClientId));

    expect(getRandomValues).toHaveBeenCalledTimes(50);
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
    }
  });
});
