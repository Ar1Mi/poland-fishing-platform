import { describe, expect, it } from 'vitest';
import { PermitStatus } from '../../enums.js';
import { permitActiveRule, permitWaterRule } from './br-01-permit.js';
import {
  catchContext,
  externalPermit,
  OTHER_WATER,
  platformPermit,
  WATER,
} from './catch-context.fixture.js';

describe('BR-01 permit active at the catch', () => {
  // The default permit runs 2026-06-01…2026-06-30; Warsaw is UTC+2 in June.
  it.each([
    ['the first minute of the first day', '2026-05-31T22:00:00.000Z'],
    ['the last millisecond of the last day', '2026-06-30T21:59:59.999Z'],
  ])('accepts a catch in %s', (_, caughtAt) => {
    expect(permitActiveRule.check(catchContext({ catch: { caughtAt: new Date(caughtAt) } }))).toBe(
      null,
    );
  });

  it.each([
    ['before the first day', '2026-05-31T21:59:59.999Z', 'SCHEDULED'],
    ['after the last day', '2026-06-30T22:00:00.000Z', 'EXPIRED'],
  ])('rejects a catch %s', (_, caughtAt, status) => {
    const ctx = catchContext({ catch: { caughtAt: new Date(caughtAt) } });

    expect(permitActiveRule.check(ctx)).toEqual({
      code: 'PERMIT_NOT_ACTIVE',
      ruleId: 'BR-01',
      details: { status, validFrom: '2026-06-01', validTo: '2026-06-30' },
    });
  });

  it('checks the day of the catch, not of the check: a catch synced after the permit ended counts', () => {
    const ctx = catchContext({ now: new Date('2026-07-10T12:00:00.000Z') });

    expect(permitActiveRule.check(ctx)).toBe(null);
  });

  it.each([PermitStatus.PENDING_PAYMENT, PermitStatus.CANCELLED, PermitStatus.REVOKED])(
    'rejects a %s permit within its dates',
    (status) => {
      const ctx = catchContext({ permit: platformPermit({ status }) });

      expect(permitActiveRule.check(ctx)?.details).toMatchObject({ status });
    },
  );

  it('checks only the dates of an external permit', () => {
    const permit = externalPermit({ validFrom: '2026-06-16' });

    expect(permitActiveRule.check(catchContext({ permit: externalPermit() }))).toBe(null);
    expect(permitActiveRule.check(catchContext({ permit }))).toEqual({
      code: 'PERMIT_NOT_ACTIVE',
      ruleId: 'BR-01',
      details: { status: 'SCHEDULED', validFrom: '2026-06-16', validTo: '2026-06-30' },
    });
  });

  it('checks a released fish too', () => {
    const ctx = catchContext({
      catch: { kept: false },
      permit: platformPermit({ status: PermitStatus.REVOKED }),
    });

    expect(permitActiveRule.check(ctx)?.code).toBe('PERMIT_NOT_ACTIVE');
  });
});

describe('BR-01 permit covers the water', () => {
  it('accepts a catch on any water of the permit', () => {
    const permit = platformPermit({ waterIds: [OTHER_WATER, WATER] });

    expect(permitWaterRule.check(catchContext({ permit }))).toBe(null);
  });

  it('rejects a catch on a water the permit does not cover', () => {
    const ctx = catchContext({ catch: { fishingWaterId: OTHER_WATER } });

    expect(permitWaterRule.check(ctx)).toEqual({ code: 'PERMIT_WATER_MISMATCH', ruleId: 'BR-01' });
  });

  it('compares an external permit with the waters the angler listed', () => {
    const ctx = catchContext({ permit: externalPermit({ waterIds: [OTHER_WATER] }) });

    expect(permitWaterRule.check(ctx)?.code).toBe('PERMIT_WATER_MISMATCH');
  });

  it('checks a released fish too', () => {
    const ctx = catchContext({ catch: { kept: false, fishingWaterId: OTHER_WATER } });

    expect(permitWaterRule.check(ctx)?.code).toBe('PERMIT_WATER_MISMATCH');
  });
});
