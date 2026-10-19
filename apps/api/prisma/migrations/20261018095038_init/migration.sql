-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('pl', 'en', 'ru');

-- CreateEnum
CREATE TYPE "OneTimeTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('PZW', 'RZGW', 'PRIVATE');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('ORG_ADMIN', 'INSPECTOR');

-- CreateEnum
CREATE TYPE "WaterType" AS ENUM ('LAKE', 'RIVER', 'RESERVOIR', 'POND', 'CANAL');

-- CreateEnum
CREATE TYPE "WaterStatus" AS ENUM ('UNCLAIMED', 'CONNECTED');

-- CreateEnum
CREATE TYPE "WaterSource" AS ENUM ('RZGW', 'PZW', 'OSM', 'USER', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('NONE', 'JUNIOR', 'SENIOR');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('P24', 'FAKE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CatchSyncStatus" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('OK', 'VIOLATION');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "anglerCardNo" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'pl',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimeToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OneTimeTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OneTimeToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "kind" "OrganizationKind" NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "contactEmail" TEXT NOT NULL,
    "p24MerchantId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" "OrgRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FishingWater" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WaterType" NOT NULL,
    "region" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "description" TEXT,
    "status" "WaterStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "organizationId" UUID,
    "externalOwnerName" TEXT,
    "externalInfoUrl" TEXT,
    "source" "WaterSource" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FishingWater_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterClaim" (
    "id" UUID NOT NULL,
    "fishingWaterId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "proofFileKey" TEXT NOT NULL,
    "comment" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("query")
);

-- CreateTable
CREATE TABLE "PermitType" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "priceGrosze" INTEGER NOT NULL,
    "discountKind" "DiscountKind" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permit" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "permitTypeId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "pricePaidGrosze" INTEGER NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPermit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuerName" TEXT NOT NULL,
    "number" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "photoKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalPermit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "permitId" UUID NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "amountGrosze" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "rawNotification" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Species" (
    "id" UUID NOT NULL,
    "latinName" TEXT NOT NULL,
    "namePl" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeciesRule" (
    "id" UUID NOT NULL,
    "speciesId" UUID NOT NULL,
    "organizationId" UUID,
    "fishingWaterId" UUID,
    "minLengthCm" INTEGER,
    "closedFrom" TEXT,
    "closedTo" TEXT,
    "dailyLimitCount" INTEGER,
    "dailyLimitWeightG" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SpeciesRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatchRecord" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permitId" UUID,
    "externalPermitId" UUID,
    "fishingWaterId" UUID NOT NULL,
    "speciesId" UUID NOT NULL,
    "caughtAt" TIMESTAMPTZ(3) NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "weightG" INTEGER,
    "kept" BOOLEAN NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "photoKey" TEXT,
    "syncStatus" "CatchSyncStatus" NOT NULL,
    "violations" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "permitId" UUID NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "InspectionResult" NOT NULL,
    "notes" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FishingWaterToPermitType" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_FishingWaterToPermitType_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ExternalPermitToFishingWater" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ExternalPermitToFishingWater_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeToken_tokenHash_key" ON "OneTimeToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_nip_key" ON "Organization"("nip");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_role_key" ON "Membership"("userId", "organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "FishingWater_status_region_idx" ON "FishingWater"("status", "region");

-- CreateIndex
CREATE INDEX "FishingWater_organizationId_idx" ON "FishingWater"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FishingWater_source_sourceRef_key" ON "FishingWater"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "WaterClaim_status_idx" ON "WaterClaim"("status");

-- CreateIndex
CREATE INDEX "PermitType_organizationId_idx" ON "PermitType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Permit_number_key" ON "Permit"("number");

-- CreateIndex
CREATE INDEX "Permit_userId_validTo_idx" ON "Permit"("userId", "validTo");

-- CreateIndex
CREATE INDEX "ExternalPermit_userId_validTo_idx" ON "ExternalPermit"("userId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_sessionId_key" ON "Payment"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Species_latinName_key" ON "Species"("latinName");

-- CreateIndex
CREATE INDEX "SpeciesRule_speciesId_idx" ON "SpeciesRule"("speciesId");

-- CreateIndex
CREATE UNIQUE INDEX "CatchRecord_clientId_key" ON "CatchRecord"("clientId");

-- CreateIndex
CREATE INDEX "CatchRecord_userId_caughtAt_idx" ON "CatchRecord"("userId", "caughtAt");

-- CreateIndex
CREATE INDEX "CatchRecord_permitId_idx" ON "CatchRecord"("permitId");

-- CreateIndex
CREATE INDEX "Inspection_permitId_idx" ON "Inspection"("permitId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "_FishingWaterToPermitType_B_index" ON "_FishingWaterToPermitType"("B");

-- CreateIndex
CREATE INDEX "_ExternalPermitToFishingWater_B_index" ON "_ExternalPermitToFishingWater"("B");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeToken" ADD CONSTRAINT "OneTimeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishingWater" ADD CONSTRAINT "FishingWater_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterClaim" ADD CONSTRAINT "WaterClaim_fishingWaterId_fkey" FOREIGN KEY ("fishingWaterId") REFERENCES "FishingWater"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterClaim" ADD CONSTRAINT "WaterClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitType" ADD CONSTRAINT "PermitType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_permitTypeId_fkey" FOREIGN KEY ("permitTypeId") REFERENCES "PermitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPermit" ADD CONSTRAINT "ExternalPermit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesRule" ADD CONSTRAINT "SpeciesRule_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesRule" ADD CONSTRAINT "SpeciesRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesRule" ADD CONSTRAINT "SpeciesRule_fishingWaterId_fkey" FOREIGN KEY ("fishingWaterId") REFERENCES "FishingWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatchRecord" ADD CONSTRAINT "CatchRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatchRecord" ADD CONSTRAINT "CatchRecord_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatchRecord" ADD CONSTRAINT "CatchRecord_externalPermitId_fkey" FOREIGN KEY ("externalPermitId") REFERENCES "ExternalPermit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatchRecord" ADD CONSTRAINT "CatchRecord_fishingWaterId_fkey" FOREIGN KEY ("fishingWaterId") REFERENCES "FishingWater"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatchRecord" ADD CONSTRAINT "CatchRecord_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FishingWaterToPermitType" ADD CONSTRAINT "_FishingWaterToPermitType_A_fkey" FOREIGN KEY ("A") REFERENCES "FishingWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FishingWaterToPermitType" ADD CONSTRAINT "_FishingWaterToPermitType_B_fkey" FOREIGN KEY ("B") REFERENCES "PermitType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExternalPermitToFishingWater" ADD CONSTRAINT "_ExternalPermitToFishingWater_A_fkey" FOREIGN KEY ("A") REFERENCES "ExternalPermit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExternalPermitToFishingWater" ADD CONSTRAINT "_ExternalPermitToFishingWater_B_fkey" FOREIGN KEY ("B") REFERENCES "FishingWater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- Constraints Prisma cannot express (docs/04-data-model.md → «SQL-ограничения в миграциях») ----------

-- a catch references exactly one permit
ALTER TABLE "CatchRecord" ADD CONSTRAINT catch_exactly_one_permit
  CHECK ((("permitId" IS NOT NULL)::int + ("externalPermitId" IS NOT NULL)::int) = 1);

-- a water-level rule requires its organization
ALTER TABLE "SpeciesRule" ADD CONSTRAINT rule_water_requires_org
  CHECK ("fishingWaterId" IS NULL OR "organizationId" IS NOT NULL);

-- MM-DD format and both ends of the closed period
ALTER TABLE "SpeciesRule" ADD CONSTRAINT rule_closed_period
  CHECK (("closedFrom" IS NULL) = ("closedTo" IS NULL)
     AND ("closedFrom" IS NULL OR "closedFrom" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
     AND ("closedTo"   IS NULL OR "closedTo"   ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'));

-- a connected water has an organization
ALTER TABLE "FishingWater" ADD CONSTRAINT water_connected_has_org
  CHECK ("status" = 'UNCLAIMED' OR "organizationId" IS NOT NULL);

ALTER TABLE "Permit" ADD CONSTRAINT permit_dates CHECK ("validTo" >= "validFrom");
ALTER TABLE "PermitType" ADD CONSTRAINT permit_type_positive CHECK ("durationDays" > 0 AND "priceGrosze" >= 0);

-- one general rule per species (organization and water rules may be several, they merge to the strictest)
CREATE UNIQUE INDEX rule_one_general ON "SpeciesRule" ("speciesId") WHERE "organizationId" IS NULL AND "fishingWaterId" IS NULL;

-- one pending claim per water and organization
CREATE UNIQUE INDEX claim_one_pending ON "WaterClaim" ("fishingWaterId", "organizationId") WHERE "status" = 'PENDING';

-- ---------- Permit numbers ZW-{YYYY}-{000001} ----------

-- One sequence per year, created on the first number of that year. The advisory lock
-- makes concurrent first calls wait instead of racing on CREATE SEQUENCE; it is taken
-- only while the sequence is missing, so later calls do not serialize. Both the lock and
-- the new sequence live until the caller's transaction ends: other first calls of the
-- year wait for it (docs/04-data-model.md → «Номер разрешения»).
CREATE FUNCTION next_permit_number(p_year integer) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  seq text := format('permit_number_%s', p_year);
  n text;
BEGIN
  IF p_year NOT BETWEEN 2000 AND 9999 THEN
    RAISE EXCEPTION 'permit number year out of range: %', p_year;
  END IF;
  IF to_regclass(seq) IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('next_permit_number'));
    -- re-check: a concurrent caller may have created it while we waited
    IF to_regclass(seq) IS NULL THEN
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq);
    END IF;
  END IF;
  n := nextval(seq)::text;
  -- lpad would truncate a seventh digit
  RETURN format('ZW-%s-%s', p_year, lpad(n, greatest(6, length(n)), '0'));
END;
$$;
