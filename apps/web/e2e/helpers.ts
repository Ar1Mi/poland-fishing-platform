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
export async function withPage<T>(browser: Browser, use: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    return await use(await context.newPage());
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

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/**
 * The link of the latest email to `to` whose subject contains `subject`, from the Mailpit of
 * the run (apps/api/test/e2e-server.ts). The API sends after its transaction: waits for it.
 */
export async function emailLink(to: string, subject: string): Promise<string> {
  const mailpit = process.env.E2E_MAILPIT_URL;
  if (!mailpit) throw new Error('E2E_MAILPIT_URL comes from playwright.config.ts');
  const deadline = Date.now() + 10_000;
  for (;;) {
    const search = new URL('/api/v1/search', mailpit);
    search.searchParams.set('query', `to:"${to}"`);
    const { messages } = (await (await fetch(search)).json()) as { messages: MailpitMessage[] };
    // Newest first.
    const message = messages.find((candidate) => candidate.Subject.includes(subject));
    if (message) {
      const { Text } = (await (
        await fetch(new URL(`/api/v1/message/${message.ID}`, mailpit))
      ).json()) as { Text: string };
      const link = /https?:\/\/\S+/.exec(Text)?.[0];
      if (!link) throw new Error(`No link in the email "${message.Subject}" to ${to}`);
      return link;
    }
    if (Date.now() > deadline) throw new Error(`No email "${subject}" to ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
