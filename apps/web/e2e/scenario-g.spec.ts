import { readFile } from 'node:fs/promises';
import { warsawDate } from '@lowisko/shared';
import { expect, test } from '@playwright/test';
import { logIn, notAcrossMidnight } from './helpers';

// Scenario Г of docs/09-scenarios.md: a catch on a water that is not connected. The angler
// bought a permit from its użytkownik rybacki outside the platform, types it in with a photo
// (FR-26), records catches checked against the general rules and downloads the season register
// for the owner (FR-27). Data come from apps/api/prisma/demo-data.ts; Kacper has no other
// permits there. Lin (tench) is kept from 25 cm all year (reference-data.ts), so the scenario
// does not depend on the season.

const ANGLER = 'kacper.wisniewski@lowisko.test';
const WATER = 'Jezioro Wąsosze';
const OWNER = 'Gospodarstwo Rybackie „Wąsosze” (demo)';
const ISSUER = 'Gospodarstwo Rybackie Wąsosze';

// A 1×1 PNG: the photo of the paper permit.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);

test('Г: an external permit for an unconnected water, catches on it and the season register', async ({
  page,
}) => {
  await notAcrossMidnight();
  const season = warsawDate(new Date()).slice(0, 4);

  await test.step('the angler finds the water and its użytkownik rybacki', async () => {
    await page.goto('/login');
    await logIn(page, ANGLER);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/');
    // The filters are a <details> collapsed on the phone; <summary> has no ARIA role.
    await page.getByText('Filtry', { exact: true }).click();
    await page.getByLabel('Nazwa łowiska').fill(WATER);
    await page.getByRole('button', { name: 'Szukaj' }).click();
    await page.getByRole('link', { name: new RegExp(WATER) }).click();

    await expect(page.getByRole('heading', { level: 1, name: WATER })).toBeVisible();
    await expect(page.getByText(OWNER)).toBeVisible();
    await expect(page.getByText(/kupisz u użytkownika rybackiego/)).toBeVisible();
  });

  await test.step('adds the permit bought from the owner, with its photo', async () => {
    await page.getByRole('link', { name: 'Dodaj zezwolenie zewnętrzne na to łowisko' }).click();
    // The water of the card is already chosen.
    await expect(page.getByRole('button', { name: `Usuń łowisko ${WATER}` })).toBeVisible();
    await page.getByLabel('Wydał').fill(ISSUER);
    await page.getByLabel('Numer zezwolenia (opcjonalnie)').fill(`W/${season}/0042`);
    await page.getByLabel('Ważne od').fill(`${season}-01-01`);
    await page.getByLabel('Ważne do (włącznie)').fill(`${season}-12-31`);
    await page
      .getByLabel('Zdjęcie lub skan zezwolenia (opcjonalnie)')
      .setInputFiles({ name: 'zezwolenie.png', mimeType: 'image/png', buffer: PHOTO });
    await page.getByRole('button', { name: 'Zapisz zezwolenie' }).click();

    await expect(page.getByRole('heading', { level: 1, name: ISSUER })).toBeVisible();
    await expect(page.getByText('Aktywne')).toBeVisible();
    await expect(page.getByText('Dodano zdjęcie zezwolenia.')).toBeVisible();
  });

  await test.step('records catches on it, checked against the general rules', async () => {
    await page.getByRole('link', { name: 'Dodaj połów' }).click();
    // The device gets the new permit after the save; the form offers its water.
    await expect(page.getByLabel('Łowisko').locator('option', { hasText: WATER })).toHaveCount(1);
    await page.getByLabel('Łowisko').selectOption({ label: WATER });
    await page.getByLabel('Gatunek').selectOption({ label: 'Lin' });
    await page.getByRole('button', { name: 'Zabrana' }).click();
    await page.getByLabel('Długość (cm)').fill('20');
    await expect(page.getByText('Zabrać można rybę od 25 cm — tę trzeba wypuścić.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zapisz połów' })).toBeDisabled();

    await page.getByLabel('Długość (cm)').fill('31');
    await page.getByLabel('Waga (kg)').fill('0,6');
    await page.getByRole('button', { name: 'Zapisz połów' }).click();
    await expect(page.getByRole('heading', { name: 'Połów zapisany w rejestrze' })).toBeVisible();
  });

  await test.step('downloads the season register for the owner of the water', async () => {
    await page.goto('/me/external-permits');
    await page.getByRole('link', { name: new RegExp(ISSUER) }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `Pobierz rejestr ${season} (PDF)` }).click();

    const file = await download;
    expect(file.suggestedFilename()).toBe(`rejestr-polowow-${season}.pdf`);
    const content = await readFile(await file.path());
    expect(content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  await test.step('cannot delete the permit its catches are recorded on', async () => {
    await page.getByRole('button', { name: 'Usuń zezwolenie' }).click();
    await page.getByRole('button', { name: 'Tak, usuń' }).click();

    await expect(page.getByText(/Na tym zezwoleniu są zapisane połowy/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: ISSUER })).toBeVisible();
  });
});
