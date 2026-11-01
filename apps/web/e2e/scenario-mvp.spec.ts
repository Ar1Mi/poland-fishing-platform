import { expect, type Page, test } from '@playwright/test';

// The end-to-end MVP of docs/09-scenarios.md: Д (shortened, through the demo seed) → А (fake
// payment provider) → Б (online) → В. Accounts and data come from apps/api/prisma/demo-data.ts.

const ANGLER = { email: 'anna.nowak@lowisko.test', name: 'Anna Nowak', birthYear: '1992' };
const INSPECTOR = { email: 'straznik@lowisko.test', name: 'Piotr Zieliński' };
const ORG_ADMIN = 'admin.sielawa@lowisko.test';
const WATER = 'Jezioro Srebrne';
const ORGANIZATION = 'Koło PZW „Sielawa” (demo)';

/** `GET /me/permits/:id` of a paid permit; the QR code encodes `/verify/:qrToken` (ADR-0006). */
interface PaidPermit {
  number: string;
  qrToken: string;
}

async function logIn(page: Page, email: string): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error('SEED_DEMO_PASSWORD comes from playwright.config.ts');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

async function recordCatch(
  page: Page,
  fish: { place: string; species: string; lengthCm: string; weightKg: string },
): Promise<void> {
  await page.getByLabel('Łowisko').selectOption({ label: fish.place });
  await page.getByLabel('Gatunek').selectOption({ label: fish.species });
  await page.getByRole('button', { name: 'Zabrana' }).click();
  await page.getByLabel('Długość (cm)').fill(fish.lengthCm);
  await page.getByLabel('Waga (kg)').fill(fish.weightKg);
  await page.getByRole('button', { name: 'Zapisz połów' }).click();
}

/** The same token with one character of the signature changed: a forged QR code. */
function forged(token: string): string {
  const [header, payload, signature = ''] = token.split('.');
  // A middle character: the last one may only carry padding bits of the signature.
  const flipped = signature[10] === 'A' ? 'B' : 'A';
  return [header, payload, `${signature.slice(0, 10)}${flipped}${signature.slice(11)}`].join('.');
}

test('MVP: a seeded organization sells a permit, the angler records catches, the inspector checks', async ({
  page,
  browser,
}) => {
  await test.step('Д: the organization from the seed sells permits on its water', async () => {
    await page.goto('/');
    await page.getByText('Filtry', { exact: true }).click();
    await page.getByLabel('Nazwa łowiska').fill(WATER);
    await page.getByRole('button', { name: 'Szukaj' }).click();
    await page.getByRole('link', { name: new RegExp(WATER) }).click();

    await expect(page.getByRole('heading', { level: 1, name: WATER })).toBeVisible();
    await expect(page.getByText(ORGANIZATION)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Rodzaje zezwoleń' })).toBeVisible();
  });

  const permit = await test.step('А: the angler buys a day permit and pays (fake)', async () => {
    await page.getByRole('link', { name: 'Kup: Dzienne' }).click();
    // A guest is sent to log in and comes back to the purchase.
    await logIn(page, ANGLER.email);
    await expect(page.getByRole('heading', { name: 'Kup zezwolenie' })).toBeVisible();
    await page.getByRole('button', { name: 'Przejdź do płatności' }).click();

    await expect(page.getByRole('heading', { name: 'Płatność testowa' })).toBeVisible();
    await expect(page.getByText(/^30,00\s*zł$/)).toBeVisible();
    // The return page asks the API until the permit is paid; the paid one carries the QR token.
    const paid = page.waitForResponse(
      async (response) =>
        /^\/api\/v1\/me\/permits\/[0-9a-f-]{36}$/.test(new URL(response.url()).pathname) &&
        response.ok() &&
        ((await response.json()) as { qrToken: string | null }).qrToken !== null,
    );
    await page.getByRole('button', { name: 'Zapłać' }).click();

    // Paid by the provider's confirmation (the fake one confirms at once), not by the return.
    await expect(page.getByText('Zezwolenie opłacone')).toBeVisible();
    const permit = (await (await paid).json()) as PaidPermit;
    await page.getByRole('link', { name: 'Pokaż zezwolenie i kod QR' }).click();

    await expect(page.getByText(permit.number, { exact: true })).toBeVisible();
    await expect(page.getByText('Aktywne')).toBeVisible();
    await expect(
      page.getByRole('img', { name: `Kod QR zezwolenia ${permit.number}` }),
    ).toBeVisible();
    return permit;
  });

  await test.step('Б: catches are checked online; the organization rule rejects one', async () => {
    // The only permit of the angler: the place is named by the water alone.
    const place = WATER;
    await page.getByRole('link', { name: 'Dodaj połów' }).click();
    await recordCatch(page, { place, species: 'Karp', lengthCm: '42', weightKg: '2,4' });
    await expect(page.getByRole('heading', { name: 'Połów zapisany w rejestrze' })).toBeVisible();

    await page.getByRole('button', { name: 'Dodaj kolejny połów' }).click();
    await recordCatch(page, { place, species: 'Karp', lengthCm: '30', weightKg: '0,8' });
    await expect(page.getByRole('heading', { name: 'Połów odrzucony' })).toBeVisible();
    await expect(page.getByText('Poniżej wymiaru ochronnego')).toBeVisible();
    // 35 cm is the organization's own rule: carp has no general one (demo-data.ts).
    await expect(page.getByText('Zabrać można rybę od 35 cm — tę trzeba wypuścić.')).toBeVisible();

    await page.getByRole('link', { name: 'Przejdź do rejestru' }).click();
    await expect(page.getByRole('heading', { name: 'Rejestr połowów' })).toBeVisible();
    await expect(page.getByText('Przyjęty')).toHaveCount(1);
    await expect(page.getByText('Odrzucony')).toHaveCount(1);
  });

  await test.step('В: the inspector checks the QR code and saves a protocol', async () => {
    const inspector = await (await browser.newContext()).newPage();

    await inspector.goto(`/verify/${forged(permit.qrToken)}`);
    await expect(inspector.getByText('Zezwolenie nieważne')).toBeVisible();

    // A guest sees only the public part.
    await inspector.goto(`/verify/${permit.qrToken}`);
    await expect(inspector.getByText('Zezwolenie ważne')).toBeVisible();
    await expect(inspector.getByText(ORGANIZATION)).toBeVisible();
    await expect(inspector.getByText(ANGLER.name)).toHaveCount(0);

    await inspector.getByRole('link', { name: 'Zaloguj się jako strażnik' }).click();
    await logIn(inspector, INSPECTOR.email);
    await expect(inspector.getByRole('heading', { name: 'Dane do kontroli' })).toBeVisible();
    await expect(inspector.getByText(ANGLER.name)).toBeVisible();
    await expect(inspector.getByText(ANGLER.birthYear, { exact: true })).toBeVisible();
    const today = inspector.getByRole('region', { name: 'Połowy dzisiaj' });
    // Both catches with their verdicts; the rejected one lists its reason.
    await expect(today.getByRole('listitem').filter({ hasText: 'Karp' })).toHaveCount(2);
    await expect(today.getByText('Poniżej wymiaru ochronnego')).toBeVisible();

    await inspector.getByRole('button', { name: 'Naruszenie' }).click();
    await inspector
      .getByLabel('Uwagi')
      .fill('Zabrany karp 30 cm, poniżej wymiaru koła — pouczenie.');
    await inspector.getByRole('button', { name: 'Zapisz protokół' }).click();
    await expect(inspector.getByText(/^Protokół zapisany o /)).toBeVisible();

    await inspector.context().close();
  });

  await test.step('В: the organization admin sees the protocol', async () => {
    const admin = await (await browser.newContext()).newPage();
    await admin.goto('/login');
    await logIn(admin, ORG_ADMIN);
    await admin.getByRole('link', { name: 'Moje organizacje' }).click();
    await admin.getByRole('link', { name: 'Protokoły kontroli' }).click();

    const protocol = admin.getByRole('listitem').filter({ hasText: permit.number });
    await expect(protocol).toContainText('Naruszenie');
    await expect(protocol).toContainText(ANGLER.name);
    await expect(protocol).toContainText(INSPECTOR.name);
    await admin.context().close();
  });
});
