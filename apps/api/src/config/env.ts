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

// Variables are added here by the task that first reads them (docs/08-testing-and-infra.md → «Окружение»).
export const envSchema = z.object({
  // The safe mode is the default: development extras (debug level, pino-pretty) are opt-in.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_URL: httpOrigin,
  WEB_URL: httpOrigin,
  DATABASE_URL: postgresUrl,
});

export type Env = z.infer<typeof envSchema>;

/** `validate` hook of ConfigModule: the application does not start with an invalid environment. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
