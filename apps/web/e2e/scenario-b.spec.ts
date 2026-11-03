import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { logIn, notAcrossMidnight, withPage } from './helpers';

// Scenario Б of docs/09-scenarios.md: catches recorded without network (ADR-0009). Jan has a
// yearly permit of «Sielawa» on both its waters; the organization keeps carp from 35 cm, at most
// 2 a day on all its waters together (apps/api/prisma/demo-data.ts). He has no catch today.

const ANGLER = 'jan.kowalski@lowisko.test';
// Inspector of «Sielawa», which issued Jan's permit.
const INSPECTOR = 'straznik@lowisko.test';
const LAKE = 'Jezioro Srebrne';
const OXBOW = 'Starorzecze Narwi';

/** One of the angler's phones: logged in online, so its permits and rules are on it. */
async function phone(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/login');
  await logIn(page, ANGLER);
  await page.getByRole('link', { name: 'Połowy' }).click();
  await page.getByRole('link', { name: 'Dodaj połów' }).click();
  await expect(page.getByLabel('Łowisko')).toBeVisible();
  // The service worker keeps the app shell for a start without network.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  return page;
}

async function keepCarp(page: Page, place: string, lengthCm: string): Promise<void> {
  await page.getByLabel('Łowisko').selectOption({ label: place });
  await page.getByLabel('Gatunek').selectOption({ label: 'Karp' });
  await page.getByRole('button', { name: 'Zabrana' }).click();
  await page.getByLabel('Długość (cm)').fill(lengthCm);
  await page.getByLabel('Waga (kg)').fill('1,5');
}

async function saveOnDevice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Zapisz połów' }).click();
  await expect(page.getByRole('heading', { name: 'Zapisano na urządzeniu' })).toBeVisible();
  await expect(page.getByText('Połów zostanie wysłany do rejestru, gdy wróci sieć.')).toBeVisible();
}

/** The heading of the register's section of today (Warsaw), as `formatDayWithWeekday` writes it. */
function today(): string {
  return new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Warsaw',
  }).format(new Date());
}

test('Б: two phones record catches offline; the server rejects the one over the daily limit', async ({
  browser,
}) => {
  await notAcrossMidnight();
  const contexts = [await browser.newContext(), await browser.newContext()];
  try {
    const [first, second] = contexts as [BrowserContext, BrowserContext];
    const phoneA = await phone(first);
    const phoneB = await phone(second);

    await test.step('A opens the app without network and checks catches on the phone', async () => {
      await first.setOffline(true);
      // A start without network: the service worker serves the app, the device acts for Jan.
      await phoneA.reload();
      await expect(phoneA.getByText('Offline', { exact: true })).toBeVisible();
      await expect(phoneA.getByText('Brak sieci', { exact: true })).toBeVisible();

      await keepCarp(phoneA, LAKE, '30');
      await expect(
        phoneA.getByText('Zabrać można rybę od 35 cm — tę trzeba wypuścić.'),
      ).toBeVisible();
      await expect(phoneA.getByRole('button', { name: 'Zapisz połów' })).toBeDisabled();
      await phoneA.getByRole('button', { name: 'Wypuszczona' }).click();
      await saveOnDevice(phoneA);

      // Two kept carps: within the limit of 2 as far as this phone knows.
      for (const lengthCm of ['42', '45']) {
        await phoneA.getByRole('button', { name: 'Dodaj kolejny połów' }).click();
        await keepCarp(phoneA, LAKE, lengthCm);
        await expect(phoneA.getByText('Zgodne z zasadami łowiska')).toBeVisible();
        await saveOnDevice(phoneA);
      }
    });

    await test.step('B loses the network and keeps a carp on another water', async () => {
      await second.setOffline(true);
      await expect(phoneB.getByText('Brak sieci', { exact: true })).toBeVisible();
      await keepCarp(phoneB, OXBOW, '40');
      await saveOnDevice(phoneB);
    });

    await test.step('B syncs first: its carp is accepted', async () => {
      await second.setOffline(false);
      await expect(
        phoneB.getByRole('heading', { name: 'Połów zapisany w rejestrze' }),
      ).toBeVisible();
    });

    await test.step('A syncs: one kept carp is over the limit of the day on all waters', async () => {
      await first.setOffline(false);
      await expect(
        phoneA.getByRole('heading', { name: /^Połów (zapisany w rejestrze|odrzucony)$/ }),
      ).toBeVisible();

      await phoneA.getByRole('link', { name: 'Przejdź do rejestru' }).click();
      const day = phoneA.getByRole('region', { name: today() });
      // B's carp, A's released one and one of A's kept carps.
      await expect(day.getByText('Przyjęty')).toHaveCount(3);
      await expect(day.getByText('Odrzucony')).toHaveCount(1);
      await expect(
        day.getByText(
          'Tego dnia zabrano już 2 szt. przy limicie 2 szt. — liczą się ryby ze wszystkich łowisk.',
        ),
      ).toBeVisible();
      // Nothing waits on the phone any more.
      await expect(phoneA.getByRole('region', { name: 'Na tym urządzeniu' })).toHaveCount(0);
    });

    await test.step('В: the inspector sees the rejected catch with its reason', async () => {
      // The QR token of Jan's yearly permit, as its page gets it.
      const fetched = phoneA.waitForResponse(
        async (response) =>
          /^\/api\/v1\/me\/permits\/[0-9a-f-]{36}$/.test(new URL(response.url()).pathname) &&
          response.ok() &&
          ((await response.json()) as { qrToken: string | null }).qrToken !== null,
      );
      await phoneA.getByRole('link', { name: 'Zezwolenia' }).click();
      await phoneA
        .getByRole('link', { name: /Roczne/ })
        .first()
        .click();
      const { qrToken } = (await (await fetched).json()) as { qrToken: string };

      await withPage(browser, async (inspector) => {
        await inspector.goto(`/verify/${qrToken}`);
        await inspector.getByRole('link', { name: 'Zaloguj się jako strażnik' }).click();
        await logIn(inspector, INSPECTOR);

        const caughtToday = inspector.getByRole('region', { name: 'Połowy dzisiaj' });
        await expect(caughtToday.getByText('Dzienny limit sztuk')).toBeVisible();
        await expect(caughtToday.getByText('Odrzucony')).toHaveCount(1);
      });
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
