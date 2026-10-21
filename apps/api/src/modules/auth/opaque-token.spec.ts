import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';

describe('opaque tokens', () => {
  it('generates distinct URL-safe tokens of 256 bits', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateOpaqueToken));

    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[\w-]{43}$/);
    }
  });

  it('hashes with SHA-256 as hex', () => {
    expect(hashOpaqueToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
