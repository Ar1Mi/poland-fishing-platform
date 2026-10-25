import type { PaymentProviderKind } from '@lowisko/shared';

/** What the provider is told about a new payment (ADR-0004). */
export interface NewTransaction {
  /** Our id of the payment, unique: the provider returns it in the notification. */
  sessionId: string;
  amountGrosze: number;
  description: string;
  email: string;
  /** Where the buyer's browser comes back to; proves nothing about the payment. */
  returnUrl: string;
  /** Where the provider sends the notification. */
  statusUrl: string;
}

/** A notification whose origin the provider adapter has verified. */
export interface PaymentNotification {
  sessionId: string;
  /** The provider's id of the transaction (P24 `orderId`). */
  providerOrderId: string;
  amountGrosze: number;
}

/**
 * Adapter of a payment provider (ADR-0004): Przelewy24 sandbox (T-14) or the fake one for
 * development and tests. Chosen by `PAYMENTS_PROVIDER`.
 */
export interface PaymentProvider {
  readonly kind: PaymentProviderKind;
  /** Registers the transaction; the buyer is sent to `redirectUrl` to pay. */
  createTransaction(input: NewTransaction): Promise<{ redirectUrl: string }>;
  /** Parses a notification body and checks its signature; throws when it is not genuine. */
  handleNotification(body: unknown): Promise<PaymentNotification>;
  /** Final confirmation with the provider (P24 `transaction/verify`); without it nothing is paid. */
  confirm(notification: PaymentNotification): Promise<void>;
}

/** Injection token of the configured PaymentProvider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
