import { describe, expect, it } from 'vitest';
import { isValidNip, normalizeNip } from './nip.js';
import { createOrganizationSchema } from './schemas.js';

describe('isValidNip', () => {
  it.each(['5260250274', '1234563218', '526-025-02-74', '526 025 02 74'])('accepts %s', (nip) => {
    expect(isValidNip(nip)).toBe(true);
  });

  it.each([
    ['wrong checksum', '5260250275'],
    ['nine digits', '526025027'],
    ['eleven digits', '52602502740'],
    ['letters', 'PL5260250274'],
    ['empty', ''],
    // 1·6 + 2·2 = 10: a weighted sum ≡ 10 (mod 11) matches no check digit.
    ['checksum of 10', '1002000000'],
  ])('rejects %s', (_case, nip) => {
    expect(isValidNip(nip)).toBe(false);
  });
});

describe('normalizeNip', () => {
  it('removes spaces and dashes', () => {
    expect(normalizeNip(' 526-025 02-74 ')).toBe('5260250274');
  });
});

describe('createOrganizationSchema', () => {
  const valid = {
    name: '  Koło PZW nr 12 ',
    nip: '526-025-02-74',
    kind: 'PZW',
    contactEmail: ' kolo@example.test ',
  };

  it('trims text and stores the NIP as digits only', () => {
    expect(createOrganizationSchema.parse(valid)).toEqual({
      name: 'Koło PZW nr 12',
      nip: '5260250274',
      kind: 'PZW',
      contactEmail: 'kolo@example.test',
    });
  });

  it('rejects an invalid NIP and an unknown kind', () => {
    expect(createOrganizationSchema.safeParse({ ...valid, nip: '5260250275' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...valid, kind: 'CLUB' }).success).toBe(false);
  });
});
