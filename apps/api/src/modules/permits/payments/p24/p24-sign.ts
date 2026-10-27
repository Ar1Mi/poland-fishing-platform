import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Checksums of Przelewy24 REST API v1 (developers.przelewy24.pl): SHA-384 (hex) of a JSON
 * object with the fields in the documented order and the CRC key last. P24 builds it with
 * PHP `json_encode(..., JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)`, which is what
 * `JSON.stringify` produces: slashes and non-ASCII characters stay as they are.
 */
function sign(fields: Record<string, string | number>, crc: string): string {
  return createHash('sha384')
    .update(JSON.stringify({ ...fields, crc }))
    .digest('hex');
}

/** `transaction/register`. */
export function registerSign(
  fields: { sessionId: string; merchantId: number; amount: number; currency: string },
  crc: string,
): string {
  const { sessionId, merchantId, amount, currency } = fields;
  return sign({ sessionId, merchantId, amount, currency }, crc);
}

/** The notification sent to `urlStatus`. */
export function notificationSign(
  fields: {
    merchantId: number;
    posId: number;
    sessionId: string;
    amount: number;
    originAmount: number;
    currency: string;
    orderId: number;
    methodId: number;
    statement: string;
  },
  crc: string,
): string {
  const { merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId } =
    fields;
  const { statement } = fields;
  return sign(
    { merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement },
    crc,
  );
}

/** `transaction/verify`. */
export function verifySign(
  fields: { sessionId: string; orderId: number; amount: number; currency: string },
  crc: string,
): string {
  const { sessionId, orderId, amount, currency } = fields;
  return sign({ sessionId, orderId, amount, currency }, crc);
}

/** Constant-time comparison of a received checksum with the expected one. */
export function signMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
