import { createPrivateKey, createPublicKey } from 'node:crypto';
import { z } from 'zod';

/** Bare http(s) origin (no path or query): usable as a CORS origin and as a URL base. */
const httpOrigin = z.string().transform((value, ctx) => {
  const url = URL.canParse(value) ? new URL(value) : undefined;
  if (!url || !/^https?:$/.test(url.protocol) || url.pathname !== '/' || /[?#]/.test(value)) {
    ctx.issues.push({
      code: 'custom',
      message: 'must be an http(s) origin without path, query or fragment',
      input: value,
    });
    return z.NEVER;
  }
  return url.origin;
});

const postgresUrl = z
  .string()
  .refine((value) => URL.canParse(value) && /^postgres(ql)?:$/.test(new URL(value).protocol), {
    message: 'must be a postgresql:// connection URL',
  });

const httpUrl = z
  .string()
  .refine((value) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol), {
    message: 'must be an http(s) URL',
  });

const smtpUrl = z
  .string()
  .refine((value) => URL.canParse(value) && /^smtps?:$/.test(new URL(value).protocol), {
    message: 'must be an smtp:// or smtps:// URL',
  });

/** PEM text; a one-line value with `\n` escapes (as `keys:qr` prints it) gets its line breaks back. */
const pem = z
  .string()
  .min(1)
  .transform((value) => value.replace(/\\n/g, '\n').trim());

// Variables are added here by the task that first reads them (docs/08-testing-and-infra.md → «Окружение»).
// A new required variable also needs a placeholder in src/openapi/fixed-env.ts (`pnpm gen:api`).
export const envSchema = z.object({
  // The safe mode is the default: development extras (debug level, pino-pretty) are opt-in.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_URL: httpOrigin,
  WEB_URL: httpOrigin,
  DATABASE_URL: postgresUrl,
  // HS256 key of access tokens: at least 32 bytes (RFC 7518, 3.2).
  JWT_ACCESS_SECRET: z
    .string()
    .refine((value) => Buffer.byteLength(value) >= 32, { message: 'must be at least 32 bytes' }),
  SMTP_URL: smtpUrl,
  MAIL_FROM: z.string().min(1),
  // Catalogue import (T-10). Without a User-Agent the public Nominatim refuses requests,
  // so rows that need geocoding fail; rows with coordinates still import.
  NOMINATIM_URL: httpUrl.default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().min(1).optional(),
  // Uploaded files (T-11, StorageService); relative to the working directory of the API.
  UPLOADS_DIR: z.string().min(1).default('./uploads'),
  // Payments (ADR-0004): `fake` in development and tests, Przelewy24 (T-14) otherwise.
  PAYMENTS_PROVIDER: z.enum(['fake', 'p24']).default('fake'),
  // Required with `p24` (checked below); from the P24 panel → «Moje dane» → «Dane API».
  P24_BASE_URL: httpOrigin.default('https://sandbox.przelewy24.pl'),
  P24_MERCHANT_ID: z.coerce.number().int().positive().optional(),
  P24_POS_ID: z.coerce.number().int().positive().optional(),
  P24_API_KEY: z.string().min(1).optional(),
  P24_CRC: z.string().min(1).optional(),
  // Ed25519 pair signing permit QR tokens (ADR-0006); `pnpm --filter api keys:qr` makes one.
  QR_SIGNING_PRIVATE_KEY: pem,
  QR_SIGNING_PUBLIC_KEY: pem,
});

const P24_REQUIRED = ['P24_MERCHANT_ID', 'P24_POS_ID', 'P24_API_KEY', 'P24_CRC'] as const;

/** A broken or mismatched pair would only show up when the first QR is signed or checked. */
function checkQrKeys(
  privatePem: string,
  publicPem: string,
): { variable: 'QR_SIGNING_PRIVATE_KEY' | 'QR_SIGNING_PUBLIC_KEY'; message: string } | undefined {
  let derivedPublic: string;
  try {
    const key = createPrivateKey(privatePem);
    if (key.asymmetricKeyType !== 'ed25519') {
      return { variable: 'QR_SIGNING_PRIVATE_KEY', message: 'must be an Ed25519 key' };
    }
    derivedPublic = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
  } catch {
    return { variable: 'QR_SIGNING_PRIVATE_KEY', message: 'must be a PEM private key' };
  }
  let givenPublic: string;
  try {
    givenPublic = createPublicKey(publicPem).export({ type: 'spki', format: 'pem' }).toString();
  } catch {
    return { variable: 'QR_SIGNING_PUBLIC_KEY', message: 'must be a PEM public key' };
  }
  return derivedPublic === givenPublic
    ? undefined
    : { variable: 'QR_SIGNING_PUBLIC_KEY', message: 'must be the public half of the private key' };
}

const envWithPayments = envSchema.superRefine((env, ctx) => {
  // The fake page pays anything with one click (docs/07-security.md).
  if (env.NODE_ENV === 'production' && env.PAYMENTS_PROVIDER === 'fake') {
    ctx.addIssue({
      code: 'custom',
      path: ['PAYMENTS_PROVIDER'],
      message: 'must not be fake in production',
    });
  }
  const qrKeyIssue = checkQrKeys(env.QR_SIGNING_PRIVATE_KEY, env.QR_SIGNING_PUBLIC_KEY);
  if (qrKeyIssue) {
    ctx.addIssue({ code: 'custom', path: [qrKeyIssue.variable], message: qrKeyIssue.message });
  }
  if (env.PAYMENTS_PROVIDER === 'p24') {
    for (const variable of P24_REQUIRED) {
      if (env[variable] === undefined) {
        ctx.addIssue({ code: 'custom', path: [variable], message: 'required with p24' });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** `validate` hook of ConfigModule: the application does not start with an invalid environment. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envWithPayments.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
