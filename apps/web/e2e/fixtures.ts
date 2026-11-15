import { type Browser, type BrowserContext, test as base, expect } from '@playwright/test';

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

export { expect };
