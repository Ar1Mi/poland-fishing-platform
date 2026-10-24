import { z } from 'zod';
import { OrganizationKind } from '../enums.js';
import { isValidNip, normalizeNip } from './nip.js';

// Organization application (FR-03). The API validates the same limits with class-validator DTOs.

export const ORG_NAME_MAX_LENGTH = 200;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(ORG_NAME_MAX_LENGTH),
  nip: z.string().transform(normalizeNip).refine(isValidNip, { message: 'Invalid NIP' }),
  kind: z.enum(OrganizationKind),
  contactEmail: z.string().trim().max(254).pipe(z.email()),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
