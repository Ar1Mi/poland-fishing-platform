import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_PERMIT_MAX_WATERS,
  ExternalPermitDatesIssue,
  externalPermitDatesIssue,
  externalPermitFormSchema,
  externalPermitStatus,
} from './external-permit.js';

const WATER = '0b9f3f63-4a8e-4f3c-9d55-3f0e6b6f1a01';
const today = '2026-11-03';

describe('externalPermitStatus', () => {
  const permit = { validFrom: '2026-11-03', validTo: '2026-11-05' };

  it('follows the Warsaw calendar days, both inclusive', () => {
    // 23:30 UTC on 2 November is already 3 November in Warsaw.
    expect(externalPermitStatus(permit, new Date('2026-11-02T22:59:59Z'))).toBe('SCHEDULED');
    expect(externalPermitStatus(permit, new Date('2026-11-02T23:00:00Z'))).toBe('ACTIVE');
    expect(externalPermitStatus(permit, new Date('2026-11-05T22:59:59Z'))).toBe('ACTIVE');
    expect(externalPermitStatus(permit, new Date('2026-11-05T23:00:00Z'))).toBe('EXPIRED');
  });
});

describe('externalPermitDatesIssue', () => {
  it('accepts a one-day permit and a permit bought earlier', () => {
    expect(externalPermitDatesIssue('2026-11-03', '2026-11-03', today)).toBeNull();
    expect(externalPermitDatesIssue('2026-01-01', '2026-12-31', today)).toBeNull();
  });

  it('refuses a last day before the first', () => {
    expect(externalPermitDatesIssue('2026-11-03', '2026-11-02', today)).toBe(
      ExternalPermitDatesIssue.ORDER,
    );
  });

  it('allows 366 days and no more', () => {
    // A leap year: 366 days from the first to the last.
    expect(externalPermitDatesIssue('2028-01-01', '2028-12-31', '2027-12-01')).toBeNull();
    expect(externalPermitDatesIssue('2026-01-01', '2027-01-01', today)).toBeNull();
    expect(externalPermitDatesIssue('2026-01-01', '2027-01-02', today)).toBe(
      ExternalPermitDatesIssue.TOO_LONG,
    );
  });

  it('refuses a start more than 365 days ahead', () => {
    expect(externalPermitDatesIssue('2027-11-03', '2027-11-03', today)).toBeNull();
    expect(externalPermitDatesIssue('2027-11-04', '2027-11-04', today)).toBe(
      ExternalPermitDatesIssue.TOO_LATE,
    );
  });

  it('refuses days outside the catch seasons', () => {
    expect(externalPermitDatesIssue('1999-12-31', '2000-01-01', today)).toBe(
      ExternalPermitDatesIssue.OUT_OF_SEASONS,
    );
    expect(externalPermitDatesIssue('2100-12-31', '2101-01-01', '2100-12-01')).toBe(
      ExternalPermitDatesIssue.OUT_OF_SEASONS,
    );
  });
});

describe('externalPermitFormSchema', () => {
  const schema = externalPermitFormSchema(today);
  const valid = {
    issuerName: '  Gospodarstwo Rybackie Wąsosze ',
    number: ' ',
    validFrom: '2026-11-01',
    validTo: '2026-11-30',
    waterIds: [WATER],
  };

  it('trims the issuer and turns a blank number into null', () => {
    expect(schema.parse(valid)).toEqual({
      ...valid,
      issuerName: 'Gospodarstwo Rybackie Wąsosze',
      number: null,
    });
  });

  it('requires an issuer and at least one water', () => {
    const result = schema.safeParse({ ...valid, issuerName: ' ', waterIds: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ['issuerName', 'REQUIRED'],
      ['waterIds', 'REQUIRED'],
    ]);
  });

  it('limits the waters', () => {
    const waterIds = Array.from(
      { length: EXTERNAL_PERMIT_MAX_WATERS + 1 },
      (_, index) => `0b9f3f63-4a8e-4f3c-9d55-${String(index).padStart(12, '0')}`,
    );
    expect(schema.safeParse({ ...valid, waterIds }).success).toBe(false);
  });

  it('reports the dates on the last day', () => {
    const result = schema.safeParse({ ...valid, validTo: '2026-10-31' });
    expect(result.error?.issues).toMatchObject([{ path: ['validTo'], message: 'ORDER' }]);
  });

  it('refuses a date that does not exist', () => {
    expect(schema.safeParse({ ...valid, validTo: '2026-11-31' }).success).toBe(false);
  });
});
