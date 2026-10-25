/**
 * Where the fake payment page sends the buyer back: `returnUrl` from its own address, followed
 * only within this app (as a path), so the page cannot be used as an open redirect.
 */
export function safeReturnPath(returnUrl: string | null, origin: string): string {
  if (!returnUrl || !URL.canParse(returnUrl, origin)) {
    return '/';
  }
  const url = new URL(returnUrl, origin);
  // `//host/x` (also `/\host/x`, which URL normalises to it) is a path here but another site
  // as soon as someone puts it into an href or location.
  if (url.origin !== origin || url.pathname.startsWith('//')) {
    return '/';
  }
  return `${url.pathname}${url.search}`;
}
