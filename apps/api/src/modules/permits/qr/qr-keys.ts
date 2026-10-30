import { generateKeyPairSync } from 'node:crypto';

export interface QrKeyPair {
  privateKey: string;
  publicKey: string;
}

/** A fresh Ed25519 pair as PEM, for `QR_SIGNING_PRIVATE_KEY` / `QR_SIGNING_PUBLIC_KEY`. */
export function generateQrKeyPair(): QrKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}
