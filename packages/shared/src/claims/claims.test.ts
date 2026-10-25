import { describe, expect, it } from 'vitest';
import {
  CLAIM_PROOF_EXTENSIONS,
  CLAIM_PROOF_MIME_TYPES,
  claimProofTypeOf,
  isClaimProofMimeType,
  reviewClaimSchema,
} from './claims.js';

describe('isClaimProofMimeType', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(isClaimProofMimeType(type)).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'text/plain', 'application/zip', ''])(
    'rejects %s',
    (type) => {
      expect(isClaimProofMimeType(type)).toBe(false);
    },
  );
});

describe('claimProofTypeOf', () => {
  it('maps every proof type to its extension and back', () => {
    for (const type of CLAIM_PROOF_MIME_TYPES) {
      expect(claimProofTypeOf(`claims/x.${CLAIM_PROOF_EXTENSIONS[type]}`)).toBe(type);
    }
  });

  it('knows nothing of other extensions or names without one', () => {
    expect(claimProofTypeOf('claims/x.gif')).toBeUndefined();
    expect(claimProofTypeOf('claims/x.jpeg')).toBeUndefined();
    expect(claimProofTypeOf('claims')).toBeUndefined();
  });
});

describe('reviewClaimSchema', () => {
  it('trims the comment', () => {
    expect(reviewClaimSchema.parse({ decision: 'REJECT', comment: '  brak umowy ' })).toEqual({
      decision: 'REJECT',
      comment: 'brak umowy',
    });
  });

  it('accepts a decision without a comment', () => {
    expect(reviewClaimSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
  });

  it('rejects an unknown decision and a comment over 1000 characters', () => {
    expect(reviewClaimSchema.safeParse({ decision: 'MAYBE' }).success).toBe(false);
    expect(
      reviewClaimSchema.safeParse({ decision: 'REJECT', comment: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
});
