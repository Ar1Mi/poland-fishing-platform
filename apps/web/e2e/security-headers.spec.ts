import { test as unwatched } from '@playwright/test';
import { expect, test } from './fixtures';

// T-28: the production build is served with the security headers of security-headers.ts.
// The scenarios run under them; this checks that they are there at all.

test('the app is served with its Content-Security-Policy and framing is refused', async ({
  page,
}) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};

  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  // The map renders under the policy; a blocked tile would fail the fixture.
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
});

// Without the fixture: the violation here is the expected outcome.
unwatched('an inline script injected into the page does not run', async ({ page }) => {
  await page.goto('/');
  const ran = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const script = document.createElement('script');
        script.textContent = 'window.__injected = true;';
        document.addEventListener('securitypolicyviolation', () => resolve(false), { once: true });
        document.body.append(script);
        setTimeout(() => resolve((window as { __injected?: boolean }).__injected === true), 500);
      }),
  );

  expect(ran).toBe(false);
});
