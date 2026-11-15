import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { importCatalogue } from './stack';

/** Pinned like every other tool of the build; a new version is a deliberate change. */
const K6_IMAGE = 'grafana/k6:1.8.2';
const DIR = import.meta.dirname;
const SCRIPTS = resolve(DIR, '../../../tests/load');
/** The API of this run, seen from the container. */
const API_FROM_DOCKER = `${API_URL.replace('localhost', 'host.docker.internal')}/api/v1`;

test('k6: p95 of the API stays under 300 ms with 50 concurrent users (NFR-01)', async () => {
  await test.step('the catalogue holds 2000 waters', () => importCatalogue(2000));

  const report = join(DIR, 'report');
  mkdirSync(report, { recursive: true });
  // k6 runs as its own user in the container and writes the summary into the mounted folder.
  chmodSync(report, 0o777);
  const k6 = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      // Linux (CI) has no host.docker.internal without this; Docker Desktop ignores it.
      '--add-host=host.docker.internal:host-gateway',
      '-v',
      `${SCRIPTS}:/load/scripts:ro`,
      '-v',
      `${report}:/load/report:rw`,
      '-e',
      `API_URL=${API_FROM_DOCKER}`,
      // The value comes from this process's environment, not from the command line.
      '-e',
      'DEMO_PASSWORD',
      K6_IMAGE,
      'run',
      '--quiet',
      '/load/scripts/api.js',
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DEMO_PASSWORD: process.env.SEED_DEMO_PASSWORD },
    },
  );
  console.log(k6.stdout);
  console.log(k6.stderr);

  expect(k6.error).toBeUndefined();
  // 0 — every threshold of tests/load/api.js held; 99 — one was crossed.
  expect(k6.status, 'k6 thresholds (see the summary above)').toBe(0);
});
