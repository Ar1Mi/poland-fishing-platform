import { describe, expect, it } from 'vitest';
import { caddyHeaderBlock, securityHeaders } from './security-headers';

describe('securityHeaders', () => {
  it('allows images and requests of the configured tile host only', () => {
    const csp = securityHeaders('https://api.maptiler.com')['Content-Security-Policy'];

    expect(csp).toContain("img-src 'self' data: blob: https://api.maptiler.com;");
    expect(csp).toContain("connect-src 'self' https://api.maptiler.com;");
    expect(csp).not.toContain('openstreetmap');
  });
});

describe('caddyHeaderBlock (T-30)', () => {
  it('writes every header quoted, and removes Server', () => {
    const headers = securityHeaders('https://tile.openstreetmap.org');

    const block = caddyHeaderBlock(headers);

    expect(block.split('\n').slice(1)).toEqual([
      'header {',
      ...Object.entries(headers).map(([name, value]) => `\t${name} "${value}"`),
      '\t-Server',
      '}',
      '',
    ]);
  });

  it('escapes quotes and refuses what would break the file', () => {
    expect(caddyHeaderBlock({ 'X-Test': 'a "b"' })).toContain('\tX-Test "a \\"b\\""');
    expect(() => caddyHeaderBlock({ 'X-Test': 'a\nb' })).toThrow('X-Test');
    expect(() => caddyHeaderBlock({ 'X Test': 'a' })).toThrow();
  });
});
