import { generateQrKeyPair } from '../modules/permits/qr/qr-keys';

// Imported first by export-openapi.ts: ConfigModule decides whether to read .env when
// AppModule is loaded, so the fixed environment must be in place before that import.
// NODE_ENV is production so the document describes the production set of endpoints;
// OPENAPI_EXPORT=1 keeps .env unread. Values are placeholders: nothing connects anywhere.
const qrKeys = generateQrKeyPair();

Object.assign(process.env, {
  OPENAPI_EXPORT: '1',
  NODE_ENV: 'production',
  API_URL: 'http://localhost:3000',
  WEB_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://openapi@localhost:5432/openapi',
  JWT_ACCESS_SECRET: 'openapi-export-placeholder-32-bytes',
  SMTP_URL: 'smtp://localhost:1025',
  MAIL_FROM: 'openapi@localhost',
  // Production refuses the fake provider.
  PAYMENTS_PROVIDER: 'p24',
  P24_MERCHANT_ID: '1',
  P24_POS_ID: '1',
  P24_API_KEY: 'openapi-placeholder',
  P24_CRC: 'openapi-placeholder',
  // A throwaway pair: the export signs nothing, but the environment check wants a valid one.
  QR_SIGNING_PRIVATE_KEY: qrKeys.privateKey,
  QR_SIGNING_PUBLIC_KEY: qrKeys.publicKey,
});
