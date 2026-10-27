import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import { FakePaymentProvider } from './fake/fake-payment.provider';
import { registerSign } from './p24/p24-sign';
import { Przelewy24Provider } from './p24/przelewy24.provider';
import { createPaymentProvider } from './payment-provider.factory';

const configOf = (env: Partial<Env>) =>
  ({ get: (key: keyof Env) => env[key] }) as unknown as ConfigService<Env, true>;

describe('createPaymentProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds the fake provider', () => {
    const provider = createPaymentProvider(
      configOf({ PAYMENTS_PROVIDER: 'fake', WEB_URL: 'http://localhost:5173' }),
    );

    expect(provider).toBeInstanceOf(FakePaymentProvider);
  });

  it('builds Przelewy24 from each of its variables', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ data: { token: 'T' }, responseCode: 0 }));
    const provider = createPaymentProvider(
      configOf({
        PAYMENTS_PROVIDER: 'p24',
        P24_BASE_URL: 'https://sandbox.przelewy24.pl',
        P24_MERCHANT_ID: 11111,
        P24_POS_ID: 22222,
        P24_API_KEY: 'report-key',
        P24_CRC: 'crc-key',
      }),
    );

    const { redirectUrl } = await provider.createTransaction({
      sessionId: 's',
      amountGrosze: 100,
      description: 'd',
      email: 'jan@example.test',
      returnUrl: 'http://localhost:5173/payment/return',
      statusUrl: 'http://localhost:3000/api/v1/payments/p24/notification',
    });

    expect(provider).toBeInstanceOf(Przelewy24Provider);
    expect(redirectUrl).toBe('https://sandbox.przelewy24.pl/trnRequest/T');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url instanceof Request ? url.url : url?.toString()).toBe(
      'https://sandbox.przelewy24.pl/api/v1/transaction/register',
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('22222:report-key').toString('base64')}`,
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      merchantId: 11111,
      posId: 22222,
      sign: registerSign(
        { sessionId: 's', merchantId: 11111, amount: 100, currency: 'PLN' },
        'crc-key',
      ),
    });
  });
});
