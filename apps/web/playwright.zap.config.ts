import { defineConfig } from '@playwright/test';
import e2e from './playwright.config';

const servers = Array.isArray(e2e.webServer) ? e2e.webServer : [];

// OWASP ZAP baseline (NFR-04, T-28, `pnpm --filter web security:zap`): the same stack as the E2E
// scenarios (API with a fresh seeded database, production build in `vite preview`), scanned
// passively by ZAP in Docker. Report: apps/web/zap/report/ (not committed).
export default defineConfig({
  ...e2e,
  testDir: 'zap',
  // The spider and the passive rules take a few minutes.
  timeout: 15 * 60_000,
  reporter: [['list']],
  webServer: servers.map((server) =>
    server.name === 'web'
      ? // The container is not on localhost: the preview listens on all interfaces for this run.
        { ...server, command: `${server.command} --host` }
      : server,
  ),
});
