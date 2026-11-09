import type { DateOnly } from '../time/warsaw.js';
import { addDays } from './purchase.js';

// The "your permit expires soon" email (FR-21). Rule and reasons — docs/02-business-rules.md →
// «Напоминание об истечении». The API sweep selects the same permits in SQL.

/** The reminder is due this many days before the last day of validity (Warsaw). */
export const PERMIT_EXPIRY_REMINDER_DAYS = 3;

/** The Warsaw day the reminder of a permit valid through `validTo` is due on. */
export function expiryReminderDay(validTo: DateOnly): DateOnly {
  return addDays(validTo, -PERMIT_EXPIRY_REMINDER_DAYS);
}

/**
 * Whether a permit gets a reminder at all: only if the reminder day comes after its first day
 * (5 days or longer). A shorter permit is over within days, and its purchase email names the
 * last day; this also keeps the reminder off the day of purchase.
 */
export function hasExpiryReminder(validFrom: DateOnly, validTo: DateOnly): boolean {
  return validFrom < expiryReminderDay(validTo);
}

/**
 * Whether the reminder of a paid permit that has not been reminded yet is due on `today`: from
 * the reminder day through the last day, so a day the email could not go out is caught up.
 */
export function isExpiryReminderDue(
  permit: { validFrom: DateOnly; validTo: DateOnly },
  today: DateOnly,
): boolean {
  return (
    hasExpiryReminder(permit.validFrom, permit.validTo) &&
    expiryReminderDay(permit.validTo) <= today &&
    today <= permit.validTo
  );
}
