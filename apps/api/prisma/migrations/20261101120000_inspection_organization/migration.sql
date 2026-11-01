-- The organization owning the permit's type (T-19): GET /orgs/:orgId/inspections filters by a
-- column of its own instead of joining the tables of PermitsModule.
ALTER TABLE "Inspection" ADD COLUMN "organizationId" UUID;

-- Protocols saved before the column (none were possible before T-19) belong to the permit's type.
UPDATE "Inspection" AS i
SET "organizationId" = pt."organizationId"
FROM "Permit" AS p
JOIN "PermitType" AS pt ON pt."id" = p."permitTypeId"
WHERE p."id" = i."permitId";

ALTER TABLE "Inspection" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Inspection_organizationId_performedAt_idx" ON "Inspection"("organizationId", "performedAt");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
