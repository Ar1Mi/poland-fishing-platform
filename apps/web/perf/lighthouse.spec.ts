import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { WEB_URL } from '../playwright.config';
import { API, apiAs } from './stack';

const DIR = import.meta.dirname;
/** The organization admin of the demo seed and the connected water of its scenario (MVP). */
const ORG_ADMIN = 'admin.sielawa@lowisko.test';
const WATER = 'Jezioro Srebrne';
/** NFR-02 (docs/01-requirements.md): mobile Performance of the main screens. */
const NFR_02_PERFORMANCE = 85;

interface Manifest {
  url: string;
  isRepresentativeRun: boolean;
  summary: Record<string, number>;
}

/**
 * A phone photo as an organization uploads it: 4000 × 3000 JPEG of a few MB (drawn in the
 * browser, noise keeps JPEG from shrinking it). The API scales it down on upload (T-29); the
 * card's Largest Contentful Paint is this photo.
 */
async function phonePhoto(): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 4000;
      canvas.height = 3000;
      const context = canvas.getContext('2d')!;
      const sky = context.createLinearGradient(0, 0, 0, 3000);
      sky.addColorStop(0, '#9cc9d6');
      sky.addColorStop(1, '#083f46');
      context.fillStyle = sky;
      context.fillRect(0, 0, 4000, 3000);
      const image = context.getImageData(0, 0, 4000, 3000);
      // Grey grain over every pixel (the alpha byte stays).
      image.data.forEach((value, i) => {
        if (i % 4 !== 3) image.data[i] = value + (Math.random() - 0.5) * 40;
      });
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.85);
    });
    return Buffer.from(dataUrl.split(',')[1]!, 'base64');
  } finally {
    await browser.close();
  }
}

test('Lighthouse CI: mobile Performance on the catalogue, a card with a photo and login (NFR-02)', async () => {
  const waterId = await test.step('the organization adds a phone photo to its water', async () => {
    const admin = await apiAs(ORG_ADMIN);
    const [org] = (await (await admin.get(`${API}/me/orgs`)).json()) as { id: string }[];
    const waters = (await (await admin.get(`${API}/orgs/${org!.id}/waters`)).json()) as {
      id: string;
      name: string;
    }[];
    const water = waters.find(({ name }) => name === WATER);
    expect(water, WATER).toBeDefined();
    const photo = await phonePhoto();
    console.log(`Uploaded photo: ${(photo.length / 1024 / 1024).toFixed(1)} MB`);
    const stored = await admin.put(`${API}/orgs/${org!.id}/waters/${water!.id}/photo`, {
      multipart: { file: { name: 'staw.jpg', mimeType: 'image/jpeg', buffer: photo } },
    });
    expect(stored.status()).toBe(200);
    await admin.dispose();
    return water!.id;
  });

  // Reports of an earlier run would pass for this one if lhci stopped before writing.
  rmSync(join(DIR, 'report/lighthouse'), { recursive: true, force: true });
  const urls = [`${WEB_URL}/`, `${WEB_URL}/waters/${waterId}`, `${WEB_URL}/login`];
  const lhci = spawnSync(
    'pnpm',
    [
      'exec',
      'lhci',
      'autorun',
      '--config=perf/lighthouserc.json',
      ...urls.map((url) => `--collect.url=${url}`),
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // The Chromium of Playwright: nothing else to install, the same browser as the scenarios.
      env: { ...process.env, CHROME_PATH: chromium.executablePath() },
    },
  );
  console.log(lhci.stdout);
  console.log(lhci.stderr);

  const manifest = JSON.parse(
    readFileSync(join(DIR, 'report/lighthouse/manifest.json'), 'utf8'),
  ) as Manifest[];
  const representative = manifest.filter(({ isRepresentativeRun }) => isRepresentativeRun);
  console.table(
    representative.map(({ url, summary }) => ({
      url: new URL(url).pathname,
      ...Object.fromEntries(
        Object.entries(summary).map(([category, score]) => [category, Math.round(score * 100)]),
      ),
    })),
  );
  // NFR-02 is 85; lighthouserc.json fails below 80 (a regression), between them is a warning:
  // the preview serves HTTP/1.1, Caddy HTTP/2 — the final figure is measured behind it (T-30).
  for (const { url, summary } of representative) {
    const performance = Math.round((summary.performance ?? 0) * 100);
    if (performance < NFR_02_PERFORMANCE) {
      const description = `${new URL(url).pathname}: Performance ${performance} < ${NFR_02_PERFORMANCE} (NFR-02)`;
      console.warn(`Warning: ${description}`);
      test.info().annotations.push({ type: 'warning', description });
    }
  }
  expect(lhci.error).toBeUndefined();
  expect(lhci.status, 'Lighthouse CI assertions (see the output above)').toBe(0);
});
