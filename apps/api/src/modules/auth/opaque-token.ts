import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token for cookies and email links; URL-safe. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Only the SHA-256 of a token is stored (docs/04-data-model.md): a database leak exposes
 * no usable tokens. A fast hash suffices because the token itself has 256 bits of entropy.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
