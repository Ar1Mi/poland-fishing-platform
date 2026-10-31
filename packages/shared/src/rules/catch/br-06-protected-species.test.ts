import { describe, expect, it } from 'vitest';
import { protectedSpeciesRule } from './br-06-protected-species.js';
import { catchContext } from './catch-context.fixture.js';

describe('BR-06 protected species', () => {
  it('rejects a kept fish of a protected species', () => {
    const ctx = catchContext({ species: { isProtected: true } });

    expect(protectedSpeciesRule.check(ctx)).toEqual({ code: 'PROTECTED_SPECIES', ruleId: 'BR-06' });
  });

  it('accepts a released fish of a protected species', () => {
    const ctx = catchContext({ catch: { kept: false }, species: { isProtected: true } });

    expect(protectedSpeciesRule.check(ctx)).toBe(null);
  });

  it('accepts a kept fish of another species', () => {
    expect(protectedSpeciesRule.check(catchContext())).toBe(null);
  });
});
