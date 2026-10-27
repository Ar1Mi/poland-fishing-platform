import { DomainError } from '../../../../common/errors/domain-error';
import { notificationSign, registerSign, verifySign } from './p24-sign';
import { Przelewy24Provider } from './przelewy24.provider';

const CRC = '0123456789abcdef';
const SESSION_ID = '6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5';
const OPTIONS = {
  baseUrl: 'https://sandbox.przelewy24.pl',
  merchantId: 11111,
  posId: 22222,
  apiKey: 'report-key',
  crc: CRC,
};

/** A fetch that records requests and answers with the queued responses. */
function stubFetch(...responses: (Response | Error)[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fetch, requests };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const bodyOf = (init: RequestInit) => JSON.parse(init.body as string) as Record<string, unknown>;

/** A notification signed the way P24 signs it. */
function signedNotification(overrides: Record<string, unknown> = {}) {
  const fields = {
    merchantId: 11111,
    posId: 22222,
    sessionId: SESSION_ID,
    amount: 2500,
    originAmount: 2500,
    currency: 'PLN',
    orderId: 316565874,
    methodId: 25,
    statement: 'p24-A1B-C2D-E3F',
    ...overrides,
  };
  return { ...fields, sign: notificationSign(fields, CRC) };
}

const transaction = {
  sessionId: SESSION_ID,
  amountGrosze: 2500,
  description: 'Tygodniowe · ZW-2026-000001',
  email: 'jan@example.test',
  returnUrl: 'http://localhost:5173/payment/return?permitId=abc',
  statusUrl: 'https://api.example.test/api/v1/payments/p24/notification',
};

describe('Przelewy24Provider', () => {
  describe('createTransaction', () => {
    it('registers a signed transaction and sends the buyer to the payment page of the token', async () => {
      const { fetch, requests } = stubFetch(json({ data: { token: 'TOKEN-1' }, responseCode: 0 }));
      const provider = new Przelewy24Provider({ ...OPTIONS, fetch });

      const { redirectUrl } = await provider.createTransaction(transaction);

      expect(redirectUrl).toBe('https://sandbox.przelewy24.pl/trnRequest/TOKEN-1');
      const [request] = requests;
      expect(request?.url).toBe('https://sandbox.przelewy24.pl/api/v1/transaction/register');
      expect(request?.init.method).toBe('POST');
      expect(new Headers(request?.init.headers).get('Authorization')).toBe(
        `Basic ${Buffer.from('22222:report-key').toString('base64')}`,
      );
      expect(bodyOf(request!.init)).toEqual({
        merchantId: 11111,
        posId: 22222,
        sessionId: SESSION_ID,
        amount: 2500,
        currency: 'PLN',
        description: transaction.description,
        email: transaction.email,
        country: 'PL',
        language: 'pl',
        urlReturn: transaction.returnUrl,
        urlStatus: transaction.statusUrl,
        timeLimit: 30,
        sign: registerSign(
          { sessionId: SESSION_ID, merchantId: 11111, amount: 2500, currency: 'PLN' },
          CRC,
        ),
      });
    });

    it.each([
      ['an HTTP error', json({ error: 'Incorrect CRC value', code: 400 }, 400), /HTTP 400/],
      ['no token', json({ data: {}, responseCode: 0 }), /token/],
      ['invalid JSON', new Response('<html>', { status: 200 }), /invalid JSON/],
      ['no answer', new Error('ECONNRESET'), /did not respond/],
    ])('fails when P24 answers with %s', async (_case, response, message) => {
      const { fetch } = stubFetch(response);
      const provider = new Przelewy24Provider({ ...OPTIONS, fetch });

      await expect(provider.createTransaction(transaction)).rejects.toThrow(message);
    });
  });

  describe('handleNotification', () => {
    const provider = new Przelewy24Provider(OPTIONS);

    it('reads a genuine notification', async () => {
      await expect(provider.handleNotification(signedNotification())).resolves.toEqual({
        sessionId: SESSION_ID,
        providerOrderId: '316565874',
        amountGrosze: 2500,
      });
    });

    it('rejects a notification whose amount was changed after signing', async () => {
      const notification = { ...signedNotification(), amount: 1 };

      await expect(provider.handleNotification(notification)).rejects.toBeInstanceOf(DomainError);
    });

    it('rejects a notification signed with another CRC key', async () => {
      const notification = signedNotification();
      const forged = { ...notification, sign: notificationSign(notification, 'guessed') };

      await expect(provider.handleNotification(forged)).rejects.toBeInstanceOf(DomainError);
    });

    it.each([
      ['another merchant', { merchantId: 99999 }],
      ['another POS', { posId: 99999 }],
      ['another currency', { currency: 'EUR' }],
    ])('rejects a correctly signed notification for %s', async (_case, overrides) => {
      await expect(
        provider.handleNotification(signedNotification(overrides)),
      ).rejects.toBeInstanceOf(DomainError);
    });

    it.each([
      ['nothing', undefined],
      ['a form body as a string', 'merchantId=11111'],
      ['a missing sign', { ...signedNotification(), sign: undefined }],
      ['an amount as a string', { ...signedNotification(), amount: '2500' }],
      ['a fractional amount', signedNotification({ amount: 25.5 })],
    ])('rejects %s', async (_case, body) => {
      await expect(provider.handleNotification(body)).rejects.toBeInstanceOf(DomainError);
    });
  });

  describe('confirm', () => {
    const notification = {
      sessionId: SESSION_ID,
      providerOrderId: '316565874',
      amountGrosze: 2500,
    };

    it('verifies the transaction with a signed PUT', async () => {
      const { fetch, requests } = stubFetch(json({ data: { status: 'success' }, responseCode: 0 }));
      const provider = new Przelewy24Provider({ ...OPTIONS, fetch });

      await provider.confirm(notification);

      const [request] = requests;
      expect(request?.url).toBe('https://sandbox.przelewy24.pl/api/v1/transaction/verify');
      expect(request?.init.method).toBe('PUT');
      expect(bodyOf(request!.init)).toEqual({
        merchantId: 11111,
        posId: 22222,
        sessionId: SESSION_ID,
        orderId: 316565874,
        amount: 2500,
        currency: 'PLN',
        sign: verifySign(
          { sessionId: SESSION_ID, orderId: 316565874, amount: 2500, currency: 'PLN' },
          CRC,
        ),
      });
    });

    it.each([
      ['an HTTP error', json({ error: 'Invalid sign', code: 400 }, 400)],
      ['a status other than success', json({ data: { status: 'error' }, responseCode: 0 })],
      ['no answer', new Error('timeout')],
    ])('fails when P24 answers with %s', async (_case, response) => {
      const { fetch } = stubFetch(response);
      const provider = new Przelewy24Provider({ ...OPTIONS, fetch });

      await expect(provider.confirm(notification)).rejects.toThrow();
    });

    it('does not call P24 for an order id that is not a number', async () => {
      const { fetch, requests } = stubFetch();
      const provider = new Przelewy24Provider({ ...OPTIONS, fetch });

      await expect(
        provider.confirm({ ...notification, providerOrderId: 'FAKE-1' }),
      ).rejects.toThrow(/order id/);
      expect(requests).toHaveLength(0);
    });
  });
});
