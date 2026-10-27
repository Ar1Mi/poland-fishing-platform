import { DomainError } from '../../../../common/errors/domain-error';
import { FakePaymentProvider } from './fake-payment.provider';

describe('FakePaymentProvider', () => {
  const provider = new FakePaymentProvider('http://localhost:5173');

  it('sends the buyer to the fake payment page of the web app', async () => {
    const { redirectUrl } = await provider.createTransaction({
      sessionId: '6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5',
      amountGrosze: 2500,
      description: 'Dzienne · ZW-2026-000001',
      email: 'jan@example.test',
      returnUrl: 'http://localhost:5173/payment/return?permitId=abc',
      statusUrl: 'http://localhost:3000/api/v1/payments/fake/notification',
    });

    const url = new URL(redirectUrl);
    expect(url.origin + url.pathname).toBe(
      'http://localhost:5173/payment/fake/6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      amount: '2500',
      description: 'Dzienne · ZW-2026-000001',
      returnUrl: 'http://localhost:5173/payment/return?permitId=abc',
    });
  });

  it('reads a notification built by the fake controller', async () => {
    const notification = { sessionId: 's', providerOrderId: 'FAKE-1', amountGrosze: 2500 };

    await expect(provider.handleNotification({ ...notification, extra: true })).resolves.toEqual(
      notification,
    );
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'sessionId=s'],
    ['a fractional amount', { sessionId: 's', providerOrderId: 'FAKE-1', amountGrosze: 25.5 }],
    ['a missing order id', { sessionId: 's', amountGrosze: 2500 }],
  ])('rejects %s as a notification', async (_case, body) => {
    await expect(provider.handleNotification(body)).rejects.toBeInstanceOf(DomainError);
  });
});
