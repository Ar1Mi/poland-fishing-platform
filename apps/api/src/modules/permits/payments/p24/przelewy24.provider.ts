import { ErrorCode, PAYMENT_TIMEOUT_MINUTES, PaymentProviderKind } from '@lowisko/shared';
import { z } from 'zod';
import { DomainError } from '../../../../common/errors/domain-error';
import type { NewTransaction, PaymentNotification, PaymentProvider } from '../payment-provider';
import { notificationSign, registerSign, signMatches, verifySign } from './p24-sign';

export interface Przelewy24Options {
  /** Origin of the gateway: `https://sandbox.przelewy24.pl` or `https://secure.przelewy24.pl`. */
  baseUrl: string;
  merchantId: number;
  posId: number;
  /** «Klucz do raportów» (secretId): the password of Basic authentication, `posId` the user. */
  apiKey: string;
  /** Key of the checksums. */
  crc: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const CURRENCY = 'PLN';

const int = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** The notification body (developers.przelewy24.pl → «Notification»). */
const notificationBody = z.object({
  merchantId: int,
  posId: int,
  sessionId: z.string().min(1).max(100),
  amount: int,
  originAmount: int,
  currency: z.string(),
  orderId: int,
  methodId: int,
  statement: z.string(),
  sign: z.string(),
});

const registerResponse = z.object({ data: z.object({ token: z.string().min(1) }) });
const verifyResponse = z.object({ data: z.object({ status: z.literal('success') }) });

/**
 * Przelewy24 REST API v1 (ADR-0004), checked against developers.przelewy24.pl (T-14):
 * `transaction/register` → the buyer pays on `/trnRequest/{token}` → P24 notifies `urlStatus`
 * of a successful payment only (refusals are never notified and time out) → `transaction/verify`.
 * Until verified, the money is not the merchant's: P24 returns it to the payer.
 */
export class Przelewy24Provider implements PaymentProvider {
  readonly kind = PaymentProviderKind.P24;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: Przelewy24Options) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async createTransaction(input: NewTransaction): Promise<{ redirectUrl: string }> {
    const { merchantId, posId, crc } = this.options;
    const body = {
      merchantId,
      posId,
      sessionId: input.sessionId,
      amount: input.amountGrosze,
      currency: CURRENCY,
      description: input.description,
      email: input.email,
      country: 'PL',
      language: 'pl',
      urlReturn: input.returnUrl,
      urlStatus: input.statusUrl,
      // P24 stops taking the payment when our timeout cancels the permit.
      timeLimit: PAYMENT_TIMEOUT_MINUTES,
      sign: registerSign(
        { sessionId: input.sessionId, merchantId, amount: input.amountGrosze, currency: CURRENCY },
        crc,
      ),
    };
    const { data } = registerResponse.parse(await this.call('POST', 'transaction/register', body));
    return { redirectUrl: new URL(`/trnRequest/${data.token}`, this.options.baseUrl).toString() };
  }

  /**
   * Genuine only with a valid checksum, for our merchant and POS, in PLN. The amount is
   * compared with the stored payment by PaymentsService; P24 already refuses to take another
   * amount than registered, `originAmount`.
   */
  handleNotification(body: unknown): Promise<PaymentNotification> {
    const parsed = notificationBody.safeParse(body);
    if (!parsed.success) {
      return Promise.reject(notGenuine('Malformed P24 notification'));
    }
    const notification = parsed.data;
    if (!signMatches(notification.sign, notificationSign(notification, this.options.crc))) {
      return Promise.reject(notGenuine('P24 notification with an invalid sign'));
    }
    if (
      notification.merchantId !== this.options.merchantId ||
      notification.posId !== this.options.posId ||
      notification.currency !== CURRENCY
    ) {
      return Promise.reject(notGenuine('P24 notification for another merchant or currency'));
    }
    return Promise.resolve({
      sessionId: notification.sessionId,
      providerOrderId: String(notification.orderId),
      amountGrosze: notification.amount,
    });
  }

  async confirm(notification: PaymentNotification): Promise<void> {
    const { merchantId, posId, crc } = this.options;
    const orderId = Number(notification.providerOrderId);
    if (!Number.isSafeInteger(orderId)) {
      throw new Error(`Not a P24 order id: ${notification.providerOrderId}`);
    }
    const fields = {
      sessionId: notification.sessionId,
      orderId,
      amount: notification.amountGrosze,
      currency: CURRENCY,
    };
    verifyResponse.parse(
      await this.call('PUT', 'transaction/verify', {
        merchantId,
        posId,
        ...fields,
        sign: verifySign(fields, crc),
      }),
    );
  }

  /** A call of the REST API; any failure is an error the caller answers 500 to. */
  private async call(method: 'POST' | 'PUT', path: string, body: object): Promise<unknown> {
    const { baseUrl, posId, apiKey, timeoutMs } = this.options;
    let response: Response;
    try {
      response = await this.fetch(new URL(`/api/v1/${path}`, baseUrl), {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${posId}:${apiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new Error(`P24 ${path} did not respond`, { cause: error });
    }
    if (!response.ok) {
      // The body may echo what we sent; the status is enough to find the request in the panel.
      throw new Error(`P24 ${path} answered HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new Error(`P24 ${path} answered with invalid JSON`, { cause: error });
    }
  }
}

function notGenuine(message: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_FAILED, undefined, message);
}
