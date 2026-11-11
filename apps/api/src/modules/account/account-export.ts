import type { ActorAuditEntry } from '../audit/audit.service';
import type { SessionRecord } from '../auth/refresh-token.service';
import type { CatchDto } from '../catches/dto/catch.dto';
import type { MyOrganizationDto } from '../organizations/dto/organization.dto';
import type { ExportedInvitation } from '../organizations/members/invitations.service';
import type { ExternalPermitDto } from '../permits/dto/external-permit.dto';
import type { ExportedPermit } from '../permits/my-permits/my-permits.service';
import type { ExportedProfile } from '../users/users.service';

/** Identifies the file and its version: a later change of the layout gets a new number. */
export const ACCOUNT_EXPORT_FORMAT = 'lowisko-account-export';
export const ACCOUNT_EXPORT_VERSION = 1;

/** A protocol of an inspection of one of the user's permits, without the inspector. */
export interface ExportedInspectionView {
  id: string;
  permit: { id: string; number: string };
  organization: { id: string; name: string };
  performedAt: Date;
  result: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
}

/** A protocol the user wrote as an inspector; the holder of the permit is not named. */
export interface PerformedInspectionView {
  id: string;
  permit: { id: string; number: string };
  organization: { id: string; name: string };
  performedAt: Date;
  result: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * `GET /me/export` (RODO access, docs/05-api.md): everything the platform holds about the user,
 * as one JSON file. Dates are ISO 8601 (UTC), money in grosze; photos are not inside —
 * `photoType` says one exists, `GET /me/external-permits/:id/photo` downloads it.
 */
export interface AccountExport {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  exportedAt: Date;
  profile: ExportedProfile;
  /** Memberships: organizations and the roles held in each. */
  organizations: MyOrganizationDto[];
  /** Invitations sent to the user's address. */
  invitations: ExportedInvitation[];
  permits: ExportedPermit[];
  externalPermits: ExternalPermitDto[];
  /** Every season, with positions. */
  catches: CatchDto[];
  /** Inspections of the user's permits. */
  inspections: ExportedInspectionView[];
  /** Protocols the user wrote as an inspector of an organization. */
  inspectionsPerformed: PerformedInspectionView[];
  /** Login sessions (refresh tokens): when issued, until when, when ended. */
  sessions: SessionRecord[];
  /** Actions of the user recorded in the audit log, without their details. */
  auditLog: ActorAuditEntry[];
}
