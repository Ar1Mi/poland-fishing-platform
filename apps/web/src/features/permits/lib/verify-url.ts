/**
 * What the QR code encodes (ADR-0006): the verification page of this site with the signed token.
 * The site is served from WEB_URL, so its origin is the one the API puts into the PDF.
 */
export function verifyUrl(qrToken: string, origin = window.location.origin): string {
  return new URL(`/verify/${encodeURIComponent(qrToken)}`, origin).href;
}
