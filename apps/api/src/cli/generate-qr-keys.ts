// `pnpm --filter api keys:qr` — prints a new Ed25519 pair for permit QR tokens (ADR-0006) as two
// `.env` lines. Replacing the pair invalidates every QR shown so far; the apps fetch new tokens
// the next time they are online.
import { generateQrKeyPair } from '../modules/permits/qr/qr-keys';

const oneLine = (pem: string): string => pem.trim().replace(/\n/g, '\\n');

const { privateKey, publicKey } = generateQrKeyPair();
process.stdout.write(
  `QR_SIGNING_PRIVATE_KEY="${oneLine(privateKey)}"\nQR_SIGNING_PUBLIC_KEY="${oneLine(publicKey)}"\n`,
);
