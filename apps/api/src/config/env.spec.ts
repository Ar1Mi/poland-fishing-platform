import { generateKeyPairSync } from 'node:crypto';
import { generateQrKeyPair } from '../modules/permits/qr/qr-keys';
import { validateEnv } from './env';

const qrKeys = generateQrKeyPair();
const otherQrKeys = generateQrKeyPair();
const rsaPrivateKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).privateKey;

const valid = {
  NODE_ENV: 'production',
  API_PORT: '8080',
  API_URL: 'https://api.lowisko.example',
  WEB_URL: 'https://lowisko.example',
  DATABASE_URL: 'postgresql://lowisko:secret@db:5432/lowisko',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  SMTP_URL: 'smtp://mail:1025',
  MAIL_FROM: 'Łowisko <no-reply@lowisko.example>',
  PAYMENTS_PROVIDER: 'p24',
  P24_MERCHANT_ID: '11111',
  P24_POS_ID: '22222',
  P24_API_KEY: 'report-key',
  P24_CRC: '0123456789abcdef',
  QR_SIGNING_PRIVATE_KEY: qrKeys.privateKey,
  QR_SIGNING_PUBLIC_KEY: qrKeys.publicKey,
};

describe('validateEnv', () => {
  it('parses a valid environment and coerces the port to a number', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      API_PORT: 8080,
      NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
      UPLOADS_DIR: './uploads',
      P24_BASE_URL: 'https://sandbox.przelewy24.pl',
      P24_MERCHANT_ID: 11111,
      P24_POS_ID: 22222,
      QR_SIGNING_PRIVATE_KEY: qrKeys.privateKey.trim(),
      QR_SIGNING_PUBLIC_KEY: qrKeys.publicKey.trim(),
    });
  });

  it('uses the fake payment provider by default outside production', () => {
    const env = validateEnv({ ...valid, NODE_ENV: 'development', PAYMENTS_PROVIDER: undefined });

    expect(env.PAYMENTS_PROVIDER).toBe('fake');
  });

  it.each([
    ['set explicitly', 'fake'],
    ['left to the default', undefined],
  ])('refuses the fake payment provider in production when %s', (_case, provider) => {
    expect(() => validateEnv({ ...valid, PAYMENTS_PROVIDER: provider })).toThrow(
      'must not be fake in production',
    );
  });

  it('starts with the fake payment provider without P24 credentials in development', () => {
    const env = validateEnv({
      ...valid,
      NODE_ENV: 'development',
      PAYMENTS_PROVIDER: 'fake',
      P24_MERCHANT_ID: undefined,
      P24_POS_ID: undefined,
      P24_API_KEY: undefined,
      P24_CRC: undefined,
    });

    expect(env.PAYMENTS_PROVIDER).toBe('fake');
  });

  it.each(['P24_MERCHANT_ID', 'P24_POS_ID', 'P24_API_KEY', 'P24_CRC'])(
    'requires %s with the p24 provider',
    (variable) => {
      expect(() => validateEnv({ ...valid, [variable]: undefined })).toThrow(variable);
    },
  );

  it('accepts QR keys written on one line with \\n escapes', () => {
    const oneLine = (pem: string) => pem.trim().replace(/\n/g, '\\n');
    const env = validateEnv({
      ...valid,
      QR_SIGNING_PRIVATE_KEY: oneLine(qrKeys.privateKey),
      QR_SIGNING_PUBLIC_KEY: oneLine(qrKeys.publicKey),
    });

    expect(env.QR_SIGNING_PRIVATE_KEY).toBe(qrKeys.privateKey.trim());
    expect(env.QR_SIGNING_PUBLIC_KEY).toBe(qrKeys.publicKey.trim());
  });

  it.each([
    ['a missing private key', { QR_SIGNING_PRIVATE_KEY: undefined }, 'QR_SIGNING_PRIVATE_KEY'],
    ['a missing public key', { QR_SIGNING_PUBLIC_KEY: undefined }, 'QR_SIGNING_PUBLIC_KEY'],
    [
      'a private key that is not PEM',
      { QR_SIGNING_PRIVATE_KEY: 'secret' },
      'QR_SIGNING_PRIVATE_KEY',
    ],
    ['a public key that is not PEM', { QR_SIGNING_PUBLIC_KEY: 'public' }, 'QR_SIGNING_PUBLIC_KEY'],
    [
      'a private key that is not Ed25519',
      { QR_SIGNING_PRIVATE_KEY: rsaPrivateKey },
      'QR_SIGNING_PRIVATE_KEY',
    ],
    [
      'a public key of another pair',
      { QR_SIGNING_PUBLIC_KEY: otherQrKeys.publicKey },
      'QR_SIGNING_PUBLIC_KEY',
    ],
  ])('rejects %s', (_case, change, variable) => {
    expect(() => validateEnv({ ...valid, ...change })).toThrow(variable);
  });

  it('takes UPLOADS_DIR from the environment when set', () => {
    expect(validateEnv({ ...valid, UPLOADS_DIR: '/data/uploads' }).UPLOADS_DIR).toBe(
      '/data/uploads',
    );
  });

  it('keeps NOMINATIM_USER_AGENT optional so the API starts without geocoding', () => {
    const env = validateEnv({ ...valid, NOMINATIM_USER_AGENT: 'lowisko/1.0 (admin@example.test)' });

    expect(env.NOMINATIM_USER_AGENT).toBe('lowisko/1.0 (admin@example.test)');
    expect(validateEnv(valid).NOMINATIM_USER_AGENT).toBeUndefined();
  });

  it('applies defaults for NODE_ENV and API_PORT', () => {
    const env = validateEnv({ ...valid, NODE_ENV: undefined, API_PORT: undefined });

    expect(env.NODE_ENV).toBe('production');
    expect(env.API_PORT).toBe(3000);
  });

  it('strips the trailing slash so WEB_URL matches the browser Origin header', () => {
    expect(validateEnv({ ...valid, WEB_URL: 'https://lowisko.example/' }).WEB_URL).toBe(
      'https://lowisko.example',
    );
  });

  it('ignores variables that are not part of the schema', () => {
    expect(validateEnv({ ...valid, PATH: '/usr/bin' })).not.toHaveProperty('PATH');
  });

  it.each([
    ['missing WEB_URL', { ...valid, WEB_URL: undefined }, 'WEB_URL'],
    ['WEB_URL that is not a URL', { ...valid, WEB_URL: 'localhost' }, 'WEB_URL'],
    ['WEB_URL with a path', { ...valid, WEB_URL: 'https://lowisko.example/app' }, 'WEB_URL'],
    ['WEB_URL with a query', { ...valid, WEB_URL: 'https://lowisko.example?x=1' }, 'WEB_URL'],
    ['non-http API_URL', { ...valid, API_URL: 'ftp://api.lowisko.example' }, 'API_URL'],
    ['non-numeric API_PORT', { ...valid, API_PORT: 'abc' }, 'API_PORT'],
    ['unknown PAYMENTS_PROVIDER', { ...valid, PAYMENTS_PROVIDER: 'stripe' }, 'PAYMENTS_PROVIDER'],
    ['API_PORT out of range', { ...valid, API_PORT: '70000' }, 'API_PORT'],
    ['missing DATABASE_URL', { ...valid, DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['non-postgres DATABASE_URL', { ...valid, DATABASE_URL: 'mysql://db/lowisko' }, 'DATABASE_URL'],
    [
      'JWT_ACCESS_SECRET under 32 bytes',
      { ...valid, JWT_ACCESS_SECRET: 'a'.repeat(31) },
      'JWT_ACCESS_SECRET',
    ],
    ['missing JWT_ACCESS_SECRET', { ...valid, JWT_ACCESS_SECRET: undefined }, 'JWT_ACCESS_SECRET'],
    ['non-smtp SMTP_URL', { ...valid, SMTP_URL: 'http://mail:1025' }, 'SMTP_URL'],
    ['empty MAIL_FROM', { ...valid, MAIL_FROM: '' }, 'MAIL_FROM'],
    ['non-http NOMINATIM_URL', { ...valid, NOMINATIM_URL: 'nominatim' }, 'NOMINATIM_URL'],
    ['unknown NODE_ENV', { ...valid, NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['empty UPLOADS_DIR', { ...valid, UPLOADS_DIR: '' }, 'UPLOADS_DIR'],
    ['non-numeric P24_MERCHANT_ID', { ...valid, P24_MERCHANT_ID: 'abc' }, 'P24_MERCHANT_ID'],
    [
      'P24_BASE_URL with a path',
      { ...valid, P24_BASE_URL: 'https://sandbox.przelewy24.pl/api/v1' },
      'P24_BASE_URL',
    ],
  ])('rejects %s and names the variable', (_name, raw, variable) => {
    expect(() => validateEnv(raw)).toThrow(variable);
  });
});
