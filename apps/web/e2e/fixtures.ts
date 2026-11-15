import AxeBuilder from '@axe-core/playwright';
import {
  type Browser,
  type BrowserContext,
  type Page,
  test as base,
  expect,
} from '@playwright/test';

// Every scenario runs under the Content-Security-Policy of the production build
// (security-headers.ts, `vite preview`): a blocked script, style, image or request fails it.

/** Collects the CSP violations the pages of `context` report in the console. */
export function watchCsp(context: BrowserContext): { assertNone: () => void } {
  const violations: string[] = [];
  context.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      violations.push(`${message.location().url}: ${message.text()}`);
    }
  });
  return { assertNone: () => expect(violations, 'CSP violations').toEqual([]) };
}

/** `browser.newContext()` for another phone or person, watched like the default context. */
export async function newWatchedContext(
  browser: Browser,
): Promise<{ context: BrowserContext; assertNoCspViolations: () => void }> {
  const context = await browser.newContext();
  return { context, assertNoCspViolations: watchCsp(context).assertNone };
}

export const test = base.extend({
  context: async ({ context }, use) => {
    const csp = watchCsp(context);
    await use(context);
    csp.assertNone();
  },
});

/** WCAG 2.1 levels A and AA (NFR-05): the rules axe-core has for them. */
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Checks the screen the page shows with axe-core (NFR-05, T-29) and fails the scenario on any
 * WCAG 2.1 AA violation. Called on the main screens once their content is there; `screen`
 * names it in the report.
 */
export async function expectAccessible(page: Page, screen: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  const found = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.help} — ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
  expect(found, `WCAG 2.1 AA violations on «${screen}»`).toEqual([]);
}

export { expect };
