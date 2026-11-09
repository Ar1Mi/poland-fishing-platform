-- The "your permit expires soon" email (T-25, FR-21): set when the hourly sweep takes the permit,
-- cleared again if sending failed. NULL — not reminded yet. Permits that expired before this
-- migration are never due, so no backfill.
ALTER TABLE "Permit" ADD COLUMN     "expiryReminderSentAt" TIMESTAMPTZ(3);

-- The sweep looks for paid, not yet reminded permits by the last day of validity.
CREATE INDEX permit_expiry_reminder_due ON "Permit" ("validTo")
  WHERE "status" = 'PAID' AND "expiryReminderSentAt" IS NULL;
