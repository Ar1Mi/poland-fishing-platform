import { warsawDate, warsawDayEnd } from '@lowisko/shared';
import { type Browser, type Page, test } from '@playwright/test';

// Steps shared by the scenarios of docs/09-scenarios.md. Accounts come from
// apps/api/prisma/demo-data.ts; their password is made per run in playwright.config.ts.

/** Fills the login form the page shows. */
export async function logIn(page: Page, email: string): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error('SEED_DEMO_PASSWORD comes from playwright.config.ts');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

/** Another person on another phone: a context of their own, closed even when a step fails. */
export async function withPage(
  browser: Browser,
  use: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext();
  try {
    await use(await context.newPage());
  } finally {
    await context.close();
  }
}

/**
 * Permits, catches, daily limits and the inspector's list are of today (Warsaw). A scenario
 * takes well under a minute; a run that would cross midnight waits for it.
 */
export async function notAcrossMidnight(): Promise<void> {
  const now = new Date();
  const left = warsawDayEnd(warsawDate(now)).getTime() - now.getTime();
  if (left < 60_000) {
    test.setTimeout(test.info().timeout + left + 5_000);
    await new Promise((resolve) => setTimeout(resolve, left + 5_000));
  }
}
