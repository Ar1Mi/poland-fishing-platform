import { describe, expect, it } from 'vitest';
import { EffectivePermitStatus } from './effective-status.js';
import { REVOKE_REASON_MAX_LENGTH, isRevocable, revokePermitSchema } from './revocation.js';

describe('isRevocable', () => {
  it.each([EffectivePermitStatus.SCHEDULED, EffectivePermitStatus.ACTIVE])(
    'a %s permit can be revoked',
    (status) => {
      expect(isRevocable(status)).toBe(true);
    },
  );

  it.each([
    EffectivePermitStatus.EXPIRED,
    EffectivePermitStatus.REVOKED,
    EffectivePermitStatus.CANCELLED,
    EffectivePermitStatus.PENDING_PAYMENT,
  ])('a %s permit cannot', (status) => {
    expect(isRevocable(status)).toBe(false);
  });
});

describe('revokePermitSchema', () => {
  it('requires a reason, trimmed', () => {
    expect(revokePermitSchema.parse({ reason: '  Zwrot przelewem 12.05  ' })).toEqual({
      reason: 'Zwrot przelewem 12.05',
    });
    expect(revokePermitSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });

  it('accepts the longest reason and refuses one character more', () => {
    expect(
      revokePermitSchema.safeParse({ reason: 'a'.repeat(REVOKE_REASON_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      revokePermitSchema.safeParse({ reason: 'a'.repeat(REVOKE_REASON_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });
});
