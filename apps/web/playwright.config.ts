import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// E2E scenarios of docs/09-scenarios.md (`pnpm e2e`). Own ports, so a run does not collide
// with `pnpm dev` (3000, 5173); the API gets a fresh database every run (apps/api/test/e2e-server.ts).
const API_URL = 'http://localhost:3100';
const WEB_PORT = 4173;
const WEB_URL = `http://localhost:${WEB_PORT}`;

// The runner and each worker load this file; workers inherit the runner's environment, so the
// password made here is both the one the seed gets and the one the tests log in with.
process.env.SEED_DEMO_PASSWORD ??= randomBytes(18).toString('base64url');

/** A fresh Ed25519 pair per run (ADR-0006): QR codes of a run are valid only in that run. */
function qrSigningKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    QR_SIGNING_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    QR_SIGNING_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export default defineConfig({
  testDir: 'e2e',
  // Scenarios share the seeded database and build on each other's steps.
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Anglers and inspectors use the app on a phone (docs/06-frontend.md, mobile-first).
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      name: 'api',
      command: 'pnpm --filter api e2e:server',
      url: `${API_URL}/api/v1/health`,
      // nest build, a PostgreSQL container, migrations and seed.
      timeout: 240_000,
      // Lets the server stop its database container (otherwise the reaper does, later).
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
      env: {
        // `test` also keeps the API from reading the developer's .env.
        NODE_ENV: 'test',
        API_PORT: '3100',
        API_URL,
        WEB_URL,
        JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
        PAYMENTS_PROVIDER: 'fake',
        // Nothing in the scenarios sends e-mail; Mailpit catches it if it runs.
        SMTP_URL: 'smtp://localhost:1025',
        MAIL_FROM: 'Łowisko E2E <no-reply@lowisko.test>',
        ...qrSigningKeys(),
      },
    },
    {
      name: 'web',
      // The production build, as Caddy serves it (docs/08-testing-and-infra.md).
      command: `pnpm build && pnpm preview --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      timeout: 120_000,
      env: { API_PROXY_TARGET: API_URL },
    },
  ],
});
