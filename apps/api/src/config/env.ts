import { z } from 'zod';

/** Absolute http(s) URL without a trailing slash, so it can be used as a CORS origin and a URL base. */
const httpUrl = z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, ''));

// Variables are added here by the task that first reads them (docs/08-testing-and-infra.md → «Окружение»).
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_URL: httpUrl,
  WEB_URL: httpUrl,
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
