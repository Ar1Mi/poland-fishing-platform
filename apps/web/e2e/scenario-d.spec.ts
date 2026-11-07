import { expect, type Page, test } from '@playwright/test';
import { emailLink, logIn, notAcrossMidnight, withPage } from './helpers';

// Scenario Д of docs/09-scenarios.md (T-23): a new organization joins the platform, takes over
// a water, sells a permit on it and revokes it. Accounts and data come from
// apps/api/prisma/demo-data.ts; the representative registers here, the emails come through the
// Mailpit of the run.

const REPRESENTATIVE = {
  email: 'prezes.ukleja@lowisko.test',
  password: 'ukleja-e2e-haslo',
  firstName: 'Zofia',
  lastName: 'Wrona',
};
const SUPER_ADMIN = 'superadmin@lowisko.test';
const INSPECTOR = 'straznik@lowisko.test';
const ANGLER = 'jan.kowalski@lowisko.test';
const ORGANIZATION = 'Koło PZW „Ukleja” (e2e)';
// A valid NIP of no demo organization; the database is new on every run.
const NIP = '7010001453';
// Unconnected in the seed, and not the water of scenario Г.
const WATER = 'Staw Głęboczek';
// A 1×1 PNG and a minimal PDF: the API checks the type by the content.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function logInAs(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

/** The section link of the organization on «Moje organizacje». */
async function openSection(page: Page, section: string): Promise<void> {
  await page.goto('/org');
  await page
    .getByRole('region', { name: ORGANIZATION })
    .getByRole('link', { name: section, exact: true })
    .click();
}

test('Д: a new organization joins, takes over a water, invites an inspector, revokes a permit', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await notAcrossMidnight();

  await test.step('the representative registers and confirms the address', async () => {
    await page.goto('/register');
    await page.getByLabel('E-mail').fill(REPRESENTATIVE.email);
    await page.getByLabel('Hasło', { exact: true }).fill(REPRESENTATIVE.password);
    await page.getByLabel('Imię').fill(REPRESENTATIVE.firstName);
    await page.getByLabel('Nazwisko').fill(REPRESENTATIVE.lastName);
    await page.getByLabel('Data urodzenia').fill('1975-04-12');
    await page.getByLabel(/Akceptuję/).check();
    await page.getByRole('button', { name: 'Załóż konto' }).click();
    await expect(page.getByText('Sprawdź skrzynkę')).toBeVisible();

    await page.goto(await emailLink(REPRESENTATIVE.email, 'Potwierdź adres e-mail'));
    await expect(page.getByText('Adres e-mail potwierdzony. Możesz się zalogować.')).toBeVisible();
  });

  await test.step('they apply to register the organization', async () => {
    await page.goto('/org');
    await logInAs(page, REPRESENTATIVE.email, REPRESENTATIVE.password);
    await page.getByRole('link', { name: 'Zgłoś organizację do serwisu' }).click();
    await page.getByLabel('Nazwa organizacji').fill(ORGANIZATION);
    await page.getByLabel('NIP').fill(NIP);
    await page.getByLabel('Rodzaj').selectOption({ label: 'Koło lub okręg PZW' });
    await page.getByLabel('E-mail kontaktowy organizacji').fill('kolo.ukleja@lowisko.test');
    await page.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
    await expect(page.getByText(`Zgłoszenie „${ORGANIZATION}” wysłane`)).toBeVisible();

    await page.getByRole('link', { name: 'Przejdź do „Moje organizacje”' }).click();
    await expect(
      page.getByText('Organizacja czeka na aktywację przez administratora serwisu.'),
    ).toBeVisible();
  });

  await test.step('the super admin activates it', async () => {
    await withPage(browser, async (admin) => {
      await admin.goto('/admin/orgs');
      await logIn(admin, SUPER_ADMIN);
      await admin.getByRole('button', { name: `Aktywuj organizację ${ORGANIZATION}` }).click();
      await expect(admin.getByText('Brak organizacji o tym statusie.')).toBeVisible();
    });
  });

  await test.step('the organization claims its water with a document', async () => {
    await openSection(page, 'Wnioski o łowiska');
    await page.getByLabel('Nazwa łowiska').fill(WATER);
    await page.getByRole('button', { name: 'Szukaj' }).click();
    await page.getByRole('button', { name: new RegExp(WATER) }).click();
    await page
      .getByLabel('Dokument')
      .setInputFiles({ name: 'umowa.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.getByRole('button', { name: 'Wyślij wniosek' }).click();
    await expect(
      page.getByText(`Wniosek o łowisko ${WATER} został wysłany.`, { exact: false }),
    ).toBeVisible();
  });

  await test.step('the super admin approves the claim: the water is connected', async () => {
    await withPage(browser, async (admin) => {
      await admin.goto('/admin/claims');
      await logIn(admin, SUPER_ADMIN);
      const claim = admin.getByRole('region', { name: WATER });
      await claim.getByRole('button', { name: 'Zatwierdź' }).click();
      await claim.getByRole('button', { name: 'Tak, zatwierdź' }).click();
      await expect(admin.getByText('Brak wniosków o tym statusie.')).toBeVisible();
    });
  });

  await test.step('the organization writes the season and adds a photo of the water', async () => {
    await openSection(page, 'Łowiska');
    await page.getByRole('link', { name: new RegExp(WATER) }).click();
    await page.getByLabel('Sezon', { exact: true }).fill('1 V – 30 IX, od świtu do zmroku');
    await page.getByRole('button', { name: 'Zapisz opis i sezon' }).click();
    await expect(page.getByText('Zapisano. Karta łowiska pokazuje nowe dane.')).toBeVisible();
    await page
      .getByLabel('Dodaj zdjęcie')
      .setInputFiles({ name: 'staw.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Zapisz zdjęcie' }).click();
    await expect(page.getByRole('img', { name: `Zdjęcie łowiska ${WATER}` })).toBeVisible();

    await page.getByRole('link', { name: 'Zobacz kartę łowiska' }).click();
    await expect(page.getByRole('heading', { level: 1, name: WATER })).toBeVisible();
    await expect(page.getByText(ORGANIZATION)).toBeVisible();
    await expect(page.getByText('1 V – 30 IX, od świtu do zmroku')).toBeVisible();
  });

  await test.step('it creates a permit type: the water card offers «Kup»', async () => {
    await openSection(page, 'Rodzaje zezwoleń');
    await page.getByRole('button', { name: 'Dodaj rodzaj zezwolenia' }).click();
    await page.getByLabel('Nazwa', { exact: true }).fill('Dzienne');
    await page.getByLabel('Cena (zł)').fill('20');
    // The only water of the organization is chosen already.
    await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
    await expect(page.getByText('Zapisano rodzaj „Dzienne”.')).toBeVisible();
  });

  await test.step('it invites the inspector, who accepts with the emailed link', async () => {
    await openSection(page, 'Członkowie i zaproszenia');
    await page.getByLabel('E-mail', { exact: true }).fill(INSPECTOR);
    await page.getByLabel('Rola', { exact: true }).selectOption({ label: 'Strażnik' });
    await page.getByRole('button', { name: 'Wyślij zaproszenie' }).click();
    await expect(page.getByText(`Zaproszenie wysłane na ${INSPECTOR}.`)).toBeVisible();

    const link = await emailLink(INSPECTOR, ORGANIZATION);
    await withPage(browser, async (inspector) => {
      await inspector.goto(link);
      // A guest logs in first and comes back to the invitation.
      await logIn(inspector, INSPECTOR);
      await inspector.getByRole('button', { name: 'Przyjmij zaproszenie' }).click();
      await expect(
        inspector.getByText(`Dołączyłeś do organizacji ${ORGANIZATION} jako Strażnik`),
      ).toBeVisible();
      await inspector.getByRole('link', { name: 'Przejdź do „Moje organizacje”' }).click();
      await expect(inspector.getByRole('region', { name: ORGANIZATION })).toBeVisible();
    });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Piotr Zieliński' })).toBeVisible();
  });

  const number = await test.step('an angler buys a permit on the water', async () => {
    return withPage(browser, async (angler) => {
      await angler.goto('/');
      await angler.getByText('Filtry', { exact: true }).click();
      await angler.getByLabel('Nazwa łowiska').fill(WATER);
      await angler.getByRole('button', { name: 'Szukaj' }).click();
      await angler.getByRole('link', { name: new RegExp(WATER) }).click();
      await angler.getByRole('link', { name: 'Kup: Dzienne' }).click();
      await logIn(angler, ANGLER);
      await angler.getByRole('button', { name: 'Przejdź do płatności' }).click();
      await angler.getByRole('button', { name: 'Zapłać' }).click();
      await expect(angler.getByText('Zezwolenie opłacone')).toBeVisible();
      await angler.getByRole('link', { name: 'Pokaż zezwolenie i kod QR' }).click();
      const shown = angler.getByText(/^ZW-\d{4}-\d{6,}$/);
      await expect(shown).toBeVisible();
      return (await shown.textContent()) ?? '';
    });
  });

  await test.step('the organization revokes the sold permit with a reason', async () => {
    await openSection(page, 'Sprzedane zezwolenia');
    const sold = page.getByRole('article', { name: number });
    await expect(sold.getByText('Jan Kowalski')).toBeVisible();
    await sold.getByRole('button', { name: `Unieważnij zezwolenie ${number}` }).click();
    await sold.getByLabel('Powód unieważnienia').fill('Rezygnacja wędkarza, zwrot przelewem');
    await sold.getByRole('button', { name: 'Unieważnij zezwolenie' }).click();
    await expect(sold.getByText('Unieważnione', { exact: true })).toBeVisible();
    await expect(sold.getByText('Rezygnacja wędkarza, zwrot przelewem')).toBeVisible();
  });

  await test.step('the angler sees the permit revoked, without its QR code', async () => {
    await withPage(browser, async (angler) => {
      await angler.goto('/me/permits');
      await logIn(angler, ANGLER);
      await angler.getByRole('link', { name: new RegExp(number) }).click();
      await expect(angler.getByText('Unieważnione')).toBeVisible();
      await expect(angler.getByRole('img', { name: `Kod QR zezwolenia ${number}` })).toHaveCount(0);
    });
  });
});
