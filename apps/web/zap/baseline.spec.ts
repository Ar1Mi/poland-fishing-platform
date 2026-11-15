import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/** Pinned like every other tool of the build; a new version is a deliberate change. */
const ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:2.16.1';
/** The preview of this run, seen from the container (allowed in vite.config.ts). */
const ORIGIN = 'http://host.docker.internal:4173';
const DIR = import.meta.dirname;

/**
 * The web app (shell, assets, manifest, service worker) and the API behind the same origin, as
 * Caddy will serve them: the public catalogue (JSON, helmet headers) and the Swagger UI.
 */
const TARGETS = [
  { name: 'web', url: `${ORIGIN}/` },
  { name: 'api', url: `${ORIGIN}/api/v1/waters` },
  { name: 'api-docs', url: `${ORIGIN}/api/docs` },
];

interface ZapReport {
  site: { alerts: { pluginid: string; alert: string; riskdesc: string; count: string }[] }[];
}

// zap-baseline.py exit codes: 0 — clean, 1 — a FAIL rule matched, 2 — warnings only.
for (const target of TARGETS) {
  test(`ZAP baseline of ${target.name}: no finding the rules file marks as FAIL`, () => {
    mkdirSync(join(DIR, 'report'), { recursive: true });
    // ZAP runs as its own user (uid 1000) and writes zap.yaml and the reports into the mounted
    // folder; on a Linux runner the checkout belongs to another uid (the official action does
    // the same chmod).
    chmodSync(DIR, 0o777);
    chmodSync(join(DIR, 'report'), 0o777);
    const report = `report/zap-${target.name}`;

    const zap = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        // Linux (CI) has no host.docker.internal without this; Docker Desktop ignores it.
        '--add-host=host.docker.internal:host-gateway',
        '-v',
        `${DIR}:/zap/wrk:rw`,
        ZAP_IMAGE,
        'zap-baseline.py',
        '-t',
        target.url,
        // Every rule FAILs unless rules.tsv lists it as accepted, with the reason.
        '-c',
        'rules.tsv',
        // Spider minutes; the passive rules need no AJAX spider.
        '-m',
        '2',
        '-r',
        `${report}.html`,
        '-J',
        `${report}.json`,
        '-w',
        `${report}.md`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log(zap.stdout);

    expect(zap.error).toBeUndefined();
    const { site } = JSON.parse(readFileSync(join(DIR, `${report}.json`), 'utf8')) as ZapReport;
    console.log(
      site
        .flatMap(({ alerts }) => alerts)
        .map(
          ({ pluginid, alert, riskdesc, count }) => `${pluginid} ${alert} (${riskdesc}) ×${count}`,
        )
        .join('\n'),
    );
    expect([0, 2], zap.stderr).toContain(zap.status);
  });
}
