import { describe, expect, it } from 'vitest';
import { pageCount } from './pagination.js';

describe('pageCount', () => {
  it('counts a partly filled last page', () => {
    expect(pageCount(41, 20)).toBe(3);
    expect(pageCount(40, 20)).toBe(2);
  });

  it('gives an empty list its first page', () => {
    expect(pageCount(0, 20)).toBe(1);
  });
});
