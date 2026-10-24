import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from './external-url';

describe('safeExternalUrl', () => {
  it('keeps http and https links', () => {
    expect(safeExternalUrl('https://www.pzw.pl/regulamin')).toBe('https://www.pzw.pl/regulamin');
    expect(safeExternalUrl('http://kolo12.example')).toBe('http://kolo12.example/');
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path', '/waters'],
    ['an empty value', ''],
    ['null', null],
  ])('drops %s', (_name, value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });
});
