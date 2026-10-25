import { z } from 'zod';

// Water claim (FR-24): an organization asks for a catalogue water with a proof document.

/** Upload limit of every stored file (docs/03-architecture.md → «Файлы»). */
export const CLAIM_PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Proof formats; the API checks the file signature, not the declared type. */
export const CLAIM_PROOF_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type ClaimProofMimeType = (typeof CLAIM_PROOF_MIME_TYPES)[number];

export function isClaimProofMimeType(value: string): value is ClaimProofMimeType {
  return (CLAIM_PROOF_MIME_TYPES as readonly string[]).includes(value);
}

export const CLAIM_COMMENT_MAX_LENGTH = 1000;

export const ClaimDecision = { APPROVE: 'APPROVE', REJECT: 'REJECT' } as const;
export type ClaimDecision = (typeof ClaimDecision)[keyof typeof ClaimDecision];

/** Super admin decision; the API validates the same limits with class-validator DTOs. */
export const reviewClaimSchema = z.object({
  decision: z.enum(ClaimDecision),
  comment: z.string().trim().max(CLAIM_COMMENT_MAX_LENGTH).optional(),
});
export type ReviewClaimInput = z.infer<typeof reviewClaimSchema>;
