import { describe, expect, it } from 'vitest';
import { PermitStatus } from '../enums.js';
import { effectivePermitStatus, type PermitStatusInput } from './effective-status.js';

const utc = (iso: string): Date => new Date(`${iso}Z`);

const paid = (validFrom: string, validTo: string): PermitStatusInput => ({
  status: PermitStatus.PAID,
  validFrom,
  validTo,
});

describe('effectivePermitStatus', () => {
  it.each([PermitStatus.PENDING_PAYMENT, PermitStatus.CANCELLED, PermitStatus.REVOKED])(
    'returns stored status %s regardless of dates',
    (status) => {
      const permit: PermitStatusInput = { status, validFrom: '2026-07-01', validTo: '2026-07-07' };
      expect(effectivePermitStatus(permit, utc('2026-06-01T12:00:00'))).toBe(status);
      expect(effectivePermitStatus(permit, utc('2026-07-03T12:00:00'))).toBe(status);
      expect(effectivePermitStatus(permit, utc('2026-08-01T12:00:00'))).toBe(status);
    },
  );

  it('is SCHEDULED until Warsaw midnight of validFrom', () => {
    const permit = paid('2026-07-01', '2026-07-07');
    expect(effectivePermitStatus(permit, utc('2026-06-30T21:59:59.999'))).toBe('SCHEDULED');
    expect(effectivePermitStatus(permit, utc('2026-06-30T22:00:00'))).toBe('ACTIVE');
  });

  it('stays ACTIVE through the whole last day and EXPIRES at the next Warsaw midnight', () => {
    const permit = paid('2026-07-01', '2026-07-07');
    expect(effectivePermitStatus(permit, utc('2026-07-07T21:59:59.999'))).toBe('ACTIVE');
    expect(effectivePermitStatus(permit, utc('2026-07-07T22:00:00'))).toBe('EXPIRED');
  });

  it('covers exactly one Warsaw day for a one-day permit', () => {
    const permit = paid('2026-01-15', '2026-01-15');
    expect(effectivePermitStatus(permit, utc('2026-01-14T22:59:59.999'))).toBe('SCHEDULED');
    expect(effectivePermitStatus(permit, utc('2026-01-14T23:00:00'))).toBe('ACTIVE');
    expect(effectivePermitStatus(permit, utc('2026-01-15T22:59:59.999'))).toBe('ACTIVE');
    expect(effectivePermitStatus(permit, utc('2026-01-15T23:00:00'))).toBe('EXPIRED');
  });

  it('follows the Warsaw day across the switch to winter time', () => {
    const permit = paid('2026-10-25', '2026-10-25');
    expect(effectivePermitStatus(permit, utc('2026-10-24T21:59:59.999'))).toBe('SCHEDULED');
    expect(effectivePermitStatus(permit, utc('2026-10-25T22:59:59.999'))).toBe('ACTIVE');
    expect(effectivePermitStatus(permit, utc('2026-10-25T23:00:00'))).toBe('EXPIRED');
  });

  it('handles a permit spanning New Year', () => {
    const permit = paid('2026-12-30', '2027-01-02');
    expect(effectivePermitStatus(permit, utc('2026-12-31T23:30:00'))).toBe('ACTIVE');
    expect(effectivePermitStatus(permit, utc('2027-01-02T23:00:00'))).toBe('EXPIRED');
  });
});
