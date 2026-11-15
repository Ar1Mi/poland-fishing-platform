import { type APIRequestContext, expect, request } from '@playwright/test';
import { API_URL } from '../playwright.config';

/** The API of the run (playwright.config.ts) under its global prefix. */
export const API = `${API_URL}/api/v1`;

/** Password of the demo accounts, made per run in playwright.config.ts. */
export function demoPassword(): string {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error('SEED_DEMO_PASSWORD comes from playwright.config.ts');
  return password;
}

/** A request context logged in as a demo account (apps/api/prisma/demo-data.ts). */
export async function apiAs(email: string): Promise<APIRequestContext> {
  const guest = await request.newContext();
  const login = await guest.post(`${API}/auth/login`, {
    data: { email, password: demoPassword() },
  });
  expect(login.status(), `login of ${email}`).toBe(200);
  const { accessToken } = (await login.json()) as { accessToken: string };
  await guest.dispose();
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } });
}

/**
 * Imports `count` waters with coordinates (no geocoding) through the super admin's CSV import:
 * the catalogue at the size the map is built for (WATERS_LIST_LIMIT, docs/05-api.md), spread
 * over central Poland so a phone's viewport around Warsaw holds a few hundred of them.
 */
export async function importCatalogue(count: number): Promise<void> {
  const admin = await apiAs('superadmin@lowisko.test');
  const rows = Array.from({ length: count }, (_, i) => {
    const lat = (51.0 + ((i * 7919) % 2400) / 1000).toFixed(5);
    const lng = (19.3 + ((i * 104729) % 3800) / 1000).toFixed(5);
    return `PZW,LOAD-${i},Łowisko testowe ${i},LAKE,mazowieckie,Okręg testowy PZW,,${lat},${lng},`;
  });
  const csv = [
    'source,sourceRef,name,type,region,externalOwnerName,externalInfoUrl,lat,lng,geocodeQuery',
    ...rows,
  ].join('\n');
  const imported = await admin.post(`${API}/admin/waters/import`, {
    multipart: { file: { name: 'load.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } },
  });
  expect(imported.status()).toBe(200);
  const report = (await imported.json()) as { created: number; updated: number; failed: unknown[] };
  expect(report.failed).toEqual([]);
  expect(report.created + report.updated).toBe(count);
  await admin.dispose();
}
