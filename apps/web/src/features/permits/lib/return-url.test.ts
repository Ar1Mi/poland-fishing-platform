import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-url';

const ORIGIN = 'http://localhost:5173';

describe('safeReturnPath', () => {
  it('follows the return page of this app', () => {
    expect(safeReturnPath(`${ORIGIN}/payment/return?permitId=abc`, ORIGIN)).toBe(
      '/payment/return?permitId=abc',
    );
  });

  it('accepts a path without the origin', () => {
    expect(safeReturnPath('/payment/return?permitId=abc', ORIGIN)).toBe(
      '/payment/return?permitId=abc',
    );
  });

  it.each([
    ['another site', 'https://evil.example/payment/return'],
    ['a protocol-relative URL', '//evil.example/payment/return'],
    ['another port', 'http://localhost:6666/payment/return'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['nothing', null],
    ['an empty value', ''],
  ])('goes home instead of %s', (_case, returnUrl) => {
    expect(safeReturnPath(returnUrl, ORIGIN)).toBe('/');
  });
});
