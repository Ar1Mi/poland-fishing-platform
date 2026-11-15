-- CreateIndex
CREATE INDEX "Permit_permitTypeId_idx" ON "Permit"("permitTypeId");

-- Partial index, not expressible in schema.prisma (docs/04-data-model.md): PaymentExpiryJob
-- looks only at unpaid payments older than the timeout; paid ones are most of the table.
CREATE INDEX payment_pending_created ON "Payment" ("createdAt") WHERE "status" = 'PENDING';
