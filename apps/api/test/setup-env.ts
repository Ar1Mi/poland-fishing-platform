import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateQrKeyPair } from '../src/modules/permits/qr/qr-keys';

// Fixed environment for integration tests; the real .env is never read under NODE_ENV=test.
process.env.NODE_ENV = 'test';
process.env.API_PORT = '3000';
process.env.API_URL = 'http://localhost:3000';
process.env.WEB_URL = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-bytes!';
// Never contacted: tests replace the mail transport (test/mail/fake-mail-transport.ts).
process.env.SMTP_URL = 'smtp://localhost:1025';
process.env.MAIL_FROM = 'Łowisko <no-reply@lowisko.test>';
// DATABASE_URL and TEST_DATABASE_ADMIN_URL come from the PostgreSQL container (db/global-setup.ts).
// Uploaded files of this test file go to its own folder of the run (removed by global teardown).
process.env.UPLOADS_DIR = mkdtempSync(join(process.env.TEST_UPLOADS_ROOT ?? tmpdir(), 'file-'));
// A fresh QR signing pair per test file: no key, not even a test one, lives in the repository.
const qrKeys = generateQrKeyPair();
process.env.QR_SIGNING_PRIVATE_KEY = qrKeys.privateKey;
process.env.QR_SIGNING_PUBLIC_KEY = qrKeys.publicKey;
