import { ErrorCode, PaymentProviderKind } from '@lowisko/shared';
import { DomainError } from '../../../../common/errors/domain-error';
import type { NewTransaction, PaymentNotification, PaymentProvider } from '../payment-provider';

/**
 * Provider for development and tests (`PAYMENTS_PROVIDER=fake`): the payment page is a page
 * of our web app with «Zapłać» / «Odrzuć», which calls `POST /payments/fake/:sessionId/complete`.
 * What a real gateway keeps from the registration (amount, description, where to return)
 * travels in the page URL; the page only shows it, the API decides by the stored payment.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly kind = PaymentProviderKind.FAKE;

  constructor(private readonly webUrl: string) {}

  createTransaction(input: NewTransaction): Promise<{ redirectUrl: string }> {
    const url = new URL(`/payment/fake/${encodeURIComponent(input.sessionId)}`, this.webUrl);
    url.searchParams.set('amount', String(input.amountGrosze));
    url.searchParams.set('description', input.description);
    url.searchParams.set('returnUrl', input.returnUrl);
    return Promise.resolve({ redirectUrl: url.toString() });
  }

  /** The body is built by the fake controller; there is no signature to check. */
  handleNotification(body: unknown): Promise<PaymentNotification> {
    if (!isFakeNotification(body)) {
      return Promise.reject(
        new DomainError(ErrorCode.VALIDATION_FAILED, undefined, 'Not a fake payment notification'),
      );
    }
    const { sessionId, providerOrderId, amountGrosze } = body;
    return Promise.resolve({ sessionId, providerOrderId, amountGrosze });
  }

  confirm(): Promise<void> {
    return Promise.resolve();
  }
}

function isFakeNotification(body: unknown): body is PaymentNotification {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const { sessionId, providerOrderId, amountGrosze } = body as Record<string, unknown>;
  return (
    typeof sessionId === 'string' &&
    typeof providerOrderId === 'string' &&
    Number.isSafeInteger(amountGrosze)
  );
}
