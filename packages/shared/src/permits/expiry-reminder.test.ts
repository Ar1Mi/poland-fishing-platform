import { describe, expect, it } from 'vitest';
import {
  expiryReminderDay,
  hasExpiryReminder,
  isExpiryReminderDue,
  PERMIT_EXPIRY_REMINDER_DAYS,
} from './expiry-reminder.js';
import { permitValidTo } from './purchase.js';

describe('expiryReminderDay', () => {
  it('is three days before the last day', () => {
    expect(PERMIT_EXPIRY_REMINDER_DAYS).toBe(3);
    expect(expiryReminderDay('2026-11-10')).toBe('2026-11-07');
  });

  it('crosses the start of a month and of a year', () => {
    expect(expiryReminderDay('2026-03-02')).toBe('2026-02-27');
    expect(expiryReminderDay('2028-03-02')).toBe('2028-02-28');
    expect(expiryReminderDay('2027-01-02')).toBe('2026-12-30');
  });

  it('counts calendar days across the change to summer time', () => {
    // Warsaw moves its clocks on 29 March 2026; dates are calendar days, not 24-hour spans.
    expect(expiryReminderDay('2026-03-31')).toBe('2026-03-28');
  });
});

describe('hasExpiryReminder', () => {
  const lasting = (durationDays: number) => {
    const validFrom = '2026-11-01';
    return hasExpiryReminder(validFrom, permitValidTo(validFrom, durationDays));
  };

  it.each([1, 2, 3, 4])('a %i-day permit gets no reminder', (days) => {
    expect(lasting(days)).toBe(false);
  });

  it.each([5, 7, 30, 365])('a %i-day permit gets one', (days) => {
    expect(lasting(days)).toBe(true);
  });
});

describe('isExpiryReminderDue', () => {
  // A week: 4–10 November, reminder on the 7th.
  const week = { validFrom: '2026-11-04', validTo: '2026-11-10' };

  it('is not due before the reminder day', () => {
    expect(isExpiryReminderDue(week, '2026-11-06')).toBe(false);
  });

  it('is due from the reminder day through the last day', () => {
    expect(isExpiryReminderDue(week, '2026-11-07')).toBe(true);
    expect(isExpiryReminderDue(week, '2026-11-09')).toBe(true);
    expect(isExpiryReminderDue(week, '2026-11-10')).toBe(true);
  });

  it('is never due once the permit has expired', () => {
    expect(isExpiryReminderDue(week, '2026-11-11')).toBe(false);
  });

  it('is never due for a permit of four days, even on its last days', () => {
    const fourDays = { validFrom: '2026-11-07', validTo: '2026-11-10' };
    expect(isExpiryReminderDue(fourDays, '2026-11-07')).toBe(false);
    expect(isExpiryReminderDue(fourDays, '2026-11-10')).toBe(false);
  });

  it('is due on the second day of a five-day permit', () => {
    const fiveDays = { validFrom: '2026-11-06', validTo: '2026-11-10' };
    expect(isExpiryReminderDue(fiveDays, '2026-11-07')).toBe(true);
  });
});
