import { z } from 'zod';
import { OrgRole } from '../enums.js';

// Members of an organization and invitations to it (FR-04). The API validates the same limits
// with class-validator DTOs.

/** An invitation link works this long; a new invitation of the same email and role replaces it. */
export const INVITATION_TTL_DAYS = 7;

/** RFC 5321 limit of an address, as in the account and organization forms. */
export const INVITATION_EMAIL_MAX_LENGTH = 254;

/** Body of `POST /orgs/:orgId/invitations`. */
export const invitationSchema = z.object({
  email: z.string().trim().max(INVITATION_EMAIL_MAX_LENGTH).pipe(z.email()),
  role: z.enum(OrgRole),
});
export type InvitationInput = z.infer<typeof invitationSchema>;

/**
 * Body of `PATCH /orgs/:orgId/members/:userId`: every role the member keeps, at least one —
 * a member without roles is removed with `DELETE` instead.
 */
export const memberRolesSchema = z.object({
  roles: z
    .array(z.enum(OrgRole))
    .min(1)
    .refine((roles) => new Set(roles).size === roles.length, { message: 'Duplicate role' }),
});
export type MemberRolesInput = z.infer<typeof memberRolesSchema>;
