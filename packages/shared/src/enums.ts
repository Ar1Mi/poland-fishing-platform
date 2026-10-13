// Mirrors the enums of apps/api/prisma/schema.prisma (docs/04-data-model.md).
// Kept as const objects, the same shape Prisma generates, so values are assignable both ways.
// ADR-0003: the two sets must stay identical — covered by a test once the schema exists (T-04).

export const Locale = { pl: 'pl', en: 'en', ru: 'ru' } as const;
export type Locale = (typeof Locale)[keyof typeof Locale];

export const OneTimeTokenPurpose = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;
export type OneTimeTokenPurpose = (typeof OneTimeTokenPurpose)[keyof typeof OneTimeTokenPurpose];

export const OrganizationKind = { PZW: 'PZW', RZGW: 'RZGW', PRIVATE: 'PRIVATE' } as const;
export type OrganizationKind = (typeof OrganizationKind)[keyof typeof OrganizationKind];

export const OrganizationStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const OrgRole = { ORG_ADMIN: 'ORG_ADMIN', INSPECTOR: 'INSPECTOR' } as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const WaterType = {
  LAKE: 'LAKE',
  RIVER: 'RIVER',
  RESERVOIR: 'RESERVOIR',
  POND: 'POND',
  CANAL: 'CANAL',
} as const;
export type WaterType = (typeof WaterType)[keyof typeof WaterType];

export const WaterStatus = { UNCLAIMED: 'UNCLAIMED', CONNECTED: 'CONNECTED' } as const;
export type WaterStatus = (typeof WaterStatus)[keyof typeof WaterStatus];

export const WaterSource = {
  RZGW: 'RZGW',
  PZW: 'PZW',
  OSM: 'OSM',
  USER: 'USER',
  MANUAL: 'MANUAL',
} as const;
export type WaterSource = (typeof WaterSource)[keyof typeof WaterSource];

export const ClaimStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus];

export const DiscountKind = { NONE: 'NONE', JUNIOR: 'JUNIOR', SENIOR: 'SENIOR' } as const;
export type DiscountKind = (typeof DiscountKind)[keyof typeof DiscountKind];

/** Stored statuses only; SCHEDULED/ACTIVE/EXPIRED are computed from dates (ADR-0005). */
export const PermitStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  REVOKED: 'REVOKED',
} as const;
export type PermitStatus = (typeof PermitStatus)[keyof typeof PermitStatus];

export const PaymentProviderKind = { P24: 'P24', FAKE: 'FAKE' } as const;
export type PaymentProviderKind = (typeof PaymentProviderKind)[keyof typeof PaymentProviderKind];

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const CatchSyncStatus = { ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' } as const;
export type CatchSyncStatus = (typeof CatchSyncStatus)[keyof typeof CatchSyncStatus];

export const InspectionResult = { OK: 'OK', VIOLATION: 'VIOLATION' } as const;
export type InspectionResult = (typeof InspectionResult)[keyof typeof InspectionResult];
