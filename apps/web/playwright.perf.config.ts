import { defineConfig } from '@playwright/test';
import e2e from './playwright.config';

// Performance checks (T-29) on the same stack as the E2E scenarios — the API with a fresh
// seeded database and the production build in `vite preview`:
// - `pnpm --filter web perf:lighthouse` — Lighthouse CI, mobile profile (NFR-02);
// - `pnpm --filter web perf:load` — k6 in Docker against the API (NFR-01).
// Reports: apps/web/perf/report/ (not committed).
export default defineConfig({
  ...e2e,
  testDir: 'perf',
  // Three Lighthouse runs per page; the load test holds 50 users for two minutes.
  timeout: 15 * 60_000,
  reporter: [['list']],
});
