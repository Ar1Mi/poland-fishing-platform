import { describe, expect, it } from 'vitest';
import { verifyUrl } from './verify-url';

describe('verifyUrl', () => {
  it('points at /verify/<token> on the given origin', () => {
    expect(verifyUrl('aaa.bbb.ccc', 'https://lowisko.example')).toBe(
      'https://lowisko.example/verify/aaa.bbb.ccc',
    );
  });

  it('uses the origin of the current page by default', () => {
    expect(verifyUrl('aaa.bbb.ccc')).toBe(`${window.location.origin}/verify/aaa.bbb.ccc`);
  });
});
