/**
 * Link from catalogue data (CSV import) shown to guests: only http(s), so a `javascript:` or
 * `data:` value can never become a clickable link.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
