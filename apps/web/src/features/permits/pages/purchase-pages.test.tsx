import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectTo } from '../../../shared/lib/redirect';
import { jsonResponse, mockApi, renderRoute, sentBodies } from '../../../test/render';
import type { WaterDetail } from '../../catalog/api/useWaters';
import type { PermitType } from '../api/usePermitTypes';
import type { MyPermit } from '../api/usePurchase';

// jsdom does not navigate; the test checks where the page sends the browser.
vi.mock('../../../shared/lib/redirect', () => ({ redirectTo: vi.fn() }));

const WATER_ID = '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11';
const PERMIT_ID = '5e1c2c9e-0000-4000-8000-000000000101';
const SESSION_ID = '6a7b8c9d-0000-4000-8000-000000000001';
const PAYMENT_URL = `https://sandbox.example/payment/fake/${SESSION_ID}`;

const profile = {
  id: '6f1c2c9e-0000-4000-8000-000000000001',
  email: 'jan@example.test',
  firstName: 'Jan',
  lastName: 'Kowalski',
  birthDate: '1990-05-01',
  anglerCardNo: null,
  locale: 'pl',
  isSuperAdmin: false,
};
const water: WaterDetail = {
  id: WATER_ID,
  name: 'Jezioro Białe',
  type: 'LAKE',
  status: 'CONNECTED',
  region: 'mazowieckie',
  lat: 52.1,
  lng: 21.9,
  description: null,
  organization: { id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13', name: 'Koło PZW 7', isActive: true },
  externalOwnerName: null,
  externalInfoUrl: null,
  source: 'MANUAL',
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const weekly: PermitType = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Tygodniowe',
  durationDays: 7,
  priceGrosze: 4000,
  discountKind: 'NONE',
};
const permit: MyPermit = {
  id: PERMIT_ID,
  number: 'ZW-2026-000123',
  status: 'SCHEDULED',
  validFrom: '2026-10-10',
  validTo: '2026-10-16',
  pricePaidGrosze: 4000,
  permitType: { id: weekly.id, name: 'Tygodniowe', durationDays: 7, discountKind: 'NONE' },
  organization: { id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13', name: 'Koło PZW 7' },
  createdAt: '2026-10-06T10:00:00.000Z',
};

const apiError = (code: string, status: number) => jsonResponse({ code, message: code }, status);
const session = {
  'GET /api/v1/me': () => jsonResponse(profile),
  'GET /api/v1/me/orgs': () => jsonResponse([]),
};

beforeEach(() => {
  // «Today» of the purchase form: 6 October 2026, 12:00 in Warsaw. Timers stay real.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-06T10:00:00.000Z') });
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(redirectTo).mockClear();
});

describe('buy permit page', () => {
  const showPage = (
    types: PermitType[] = [weekly],
    handlers: Parameters<typeof mockApi>[0] = {},
  ) => {
    const fetch = mockApi({
      ...session,
      [`GET /api/v1/waters/${WATER_ID}`]: () => jsonResponse(water),
      'GET /api/v1/permit-types': () => jsonResponse(types),
      ...handlers,
    });
    renderRoute(`/buy/${weekly.id}?waterId=${WATER_ID}`, { accessToken: 'access-1' });
    return fetch;
  };
  const dateField = () => screen.findByLabelText('Data rozpoczęcia');

  it('sends a guest to the login page', async () => {
    mockApi({});

    renderRoute(`/buy/${weekly.id}?waterId=${WATER_ID}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });

  it('shows the type, the water and the validity from today', async () => {
    showPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Kup zezwolenie' })).toBeVisible();
    expect(screen.getByText('Tygodniowe')).toBeVisible();
    expect(screen.getByText('7 dni')).toBeVisible();
    expect(screen.getByText('Jezioro Białe')).toBeVisible();
    expect(screen.getByText('Koło PZW 7')).toBeVisible();
    expect(screen.getByText('40,00 zł')).toBeVisible();
    expect(await dateField()).toHaveValue('2026-10-06');
    expect(await dateField()).toHaveAttribute('min', '2026-10-06');
    expect(await dateField()).toHaveAttribute('max', '2027-10-06');
    expect(screen.getByText('Ważne od 6 paź 2026 do 12 paź 2026 włącznie')).toBeVisible();
  });

  it('buys from the chosen day and sends the browser to the payment page', async () => {
    const fetch = showPage([weekly], {
      'POST /api/v1/permits': () => jsonResponse({ permit, paymentUrl: PAYMENT_URL }, 201),
    });

    fireEvent.change(await dateField(), { target: { value: '2026-10-10' } });
    expect(screen.getByText('Ważne od 10 paź 2026 do 16 paź 2026 włącznie')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Przejdź do płatności' }));

    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledWith(PAYMENT_URL));
    expect(await sentBodies(fetch, 'POST /api/v1/permits')).toEqual([
      { permitTypeId: weekly.id, validFrom: '2026-10-10' },
    ]);
    expect(screen.getByRole('button', { name: 'Przejdź do płatności' })).toBeDisabled();
  });

  it.each([
    ['2026-10-05', 'Data rozpoczęcia nie może być wcześniejsza niż dzisiaj.'],
    ['2027-10-07', 'Najpóźniejsza data rozpoczęcia to 6 paź 2027.'],
    ['', 'Podaj datę rozpoczęcia.'],
  ])('does not send the start %j', async (validFrom, message) => {
    const fetch = showPage([weekly], {
      'POST /api/v1/permits': () => jsonResponse({ permit, paymentUrl: PAYMENT_URL }, 201),
    });

    fireEvent.change(await dateField(), { target: { value: validFrom } });
    await userEvent.click(screen.getByRole('button', { name: 'Przejdź do płatności' }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/permits')).toEqual([]);
  });

  it('shows why the API refused the purchase', async () => {
    showPage([{ ...weekly, discountKind: 'JUNIOR' }], {
      'POST /api/v1/permits': () => apiError('DISCOUNT_NOT_ELIGIBLE', 422),
    });

    expect(
      await screen.findByText(
        'Zezwolenie ulgowe dla osób, które w dniu rozpoczęcia nie mają ukończonych 16 lat.',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Przejdź do płatności' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Ta zniżka Ci nie przysługuje.')).toBeVisible();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('explains the senior discount', async () => {
    showPage([{ ...weekly, discountKind: 'SENIOR' }]);

    expect(
      await screen.findByText(
        'Zezwolenie ulgowe dla osób, które w dniu rozpoczęcia mają ukończone 65 lat.',
      ),
    ).toBeVisible();
  });

  it('offers a free permit without a payment', async () => {
    showPage([{ ...weekly, priceGrosze: 0 }]);

    expect(
      await screen.findByRole('button', { name: 'Odbierz bezpłatne zezwolenie' }),
    ).toBeVisible();
    expect(screen.queryByText(/po potwierdzeniu płatności/)).not.toBeInTheDocument();
  });

  it('says when the type is no longer on sale for the water', async () => {
    showPage([]);

    expect(
      await screen.findByText('Ten rodzaj zezwolenia nie jest już sprzedawany na tym łowisku.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Wróć do łowiska' })).toHaveAttribute(
      'href',
      `/waters/${WATER_ID}`,
    );
  });

  it('says the same for a link without its water', async () => {
    mockApi(session);

    renderRoute(`/buy/${weekly.id}`, { accessToken: 'access-1' });

    expect(
      await screen.findByText('Ten rodzaj zezwolenia nie jest już sprzedawany na tym łowisku.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Wróć do mapy łowisk' })).toHaveAttribute('href', '/');
  });
});

describe('fake payment page', () => {
  const pageUrl = () => {
    const returnUrl = `${window.location.origin}/payment/return?permitId=${PERMIT_ID}`;
    const query = new URLSearchParams({
      amount: '4000',
      description: 'Tygodniowe · ZW-2026-000123',
      returnUrl,
    });
    return `/payment/fake/${SESSION_ID}?${query.toString()}`;
  };
  const COMPLETE = `POST /api/v1/payments/fake/${SESSION_ID}/complete`;

  it('pays and comes back to the return page, which shows the paid permit', async () => {
    const fetch = mockApi({
      ...session,
      [COMPLETE]: () => jsonResponse({ status: 'SUCCEEDED' }),
      [`GET /api/v1/me/permits/${PERMIT_ID}`]: () => jsonResponse(permit),
    });
    renderRoute(pageUrl(), { accessToken: 'access-1' });

    expect(await screen.findByRole('heading', { name: 'Płatność testowa' })).toBeVisible();
    expect(screen.getByText('Tygodniowe · ZW-2026-000123')).toBeVisible();
    expect(screen.getByText('40,00 zł')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Zapłać' }));

    expect(await screen.findByText('Zezwolenie opłacone')).toBeVisible();
    expect(await sentBodies(fetch, COMPLETE)).toEqual([{ outcome: 'PAID' }]);
  });

  it('refuses and comes back to the return page, which shows the cancellation', async () => {
    const fetch = mockApi({
      ...session,
      [COMPLETE]: () => jsonResponse({ status: 'FAILED' }),
      [`GET /api/v1/me/permits/${PERMIT_ID}`]: () =>
        jsonResponse({ ...permit, status: 'CANCELLED' }),
    });
    renderRoute(pageUrl(), { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Odrzuć płatność' }));

    expect(await screen.findByText('Płatność nie została zrealizowana')).toBeVisible();
    expect(await sentBodies(fetch, COMPLETE)).toEqual([{ outcome: 'REJECTED' }]);
  });

  it('stays on the page when the API refuses', async () => {
    mockApi({ ...session, [COMPLETE]: () => apiError('NOT_FOUND', 404) });
    renderRoute(pageUrl(), { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Zapłać' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('NOT_FOUND')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Płatność testowa' })).toBeVisible();
  });
});

describe('payment return page', () => {
  const PERMIT = `GET /api/v1/me/permits/${PERMIT_ID}`;
  const show = (answers: MyPermit['status'][]) => {
    let asked = 0;
    const fetch = mockApi({
      ...session,
      [PERMIT]: () => {
        const status = answers[Math.min(asked, answers.length - 1)]!;
        asked += 1;
        return jsonResponse({ ...permit, status });
      },
    });
    renderRoute(`/payment/return?permitId=${PERMIT_ID}`, { accessToken: 'access-1' });
    return fetch;
  };
  const permitRequests = (fetch: ReturnType<typeof mockApi>) =>
    fetch.mock.calls.filter(([request]) => new URL(request.url).pathname.includes('/me/permits/'))
      .length;
  /** Moves the fake clock and its timers; the polling interval is 2 s. */
  const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-06T10:00:00.000Z') });
  });

  it('shows the paid permit with its number and dates', async () => {
    show(['SCHEDULED']);

    expect(await screen.findByText('Zezwolenie opłacone')).toBeVisible();
    expect(screen.getByText('ZW-2026-000123')).toBeVisible();
    expect(screen.getByText('Zaplanowane')).toBeVisible();
    expect(screen.getByText('Koło PZW 7')).toBeVisible();
    expect(screen.getByText('Ważne od 10 paź 2026 do 16 paź 2026 włącznie')).toBeVisible();
  });

  it('waits for the confirmation, asking every 2 seconds', async () => {
    const fetch = show(['PENDING_PAYMENT', 'PENDING_PAYMENT', 'SCHEDULED']);

    expect(await screen.findByText('Czekamy na potwierdzenie płatności…')).toBeVisible();
    await wait(2000);
    expect(permitRequests(fetch)).toBe(2);
    await wait(2000);

    expect(await screen.findByText('Zezwolenie opłacone')).toBeVisible();
    await wait(10_000);
    expect(permitRequests(fetch)).toBe(3);
  });

  it('stops after 60 seconds and lets the buyer check again', async () => {
    const fetch = show([...Array<MyPermit['status']>(31).fill('PENDING_PAYMENT'), 'SCHEDULED']);

    expect(await screen.findByText('Czekamy na potwierdzenie płatności…')).toBeVisible();
    await wait(60_000);

    expect(await screen.findByText(/Płatność nie została jeszcze potwierdzona/)).toBeVisible();
    const asked = permitRequests(fetch);
    expect(asked).toBe(31);
    await wait(10_000);
    expect(permitRequests(fetch)).toBe(asked);

    await userEvent.click(screen.getByRole('button', { name: 'Sprawdź ponownie' }));

    expect(await screen.findByText('Zezwolenie opłacone')).toBeVisible();
  });

  it('says when the payment did not go through', async () => {
    show(['CANCELLED']);

    expect(await screen.findByText('Płatność nie została zrealizowana')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Wróć do mapy łowisk' })).toHaveAttribute('href', '/');
  });

  it('says when it does not know the permit', async () => {
    mockApi(session);

    renderRoute('/payment/return', { accessToken: 'access-1' });

    expect(
      await screen.findByText('Nie wiemy, którego zezwolenia dotyczy płatność.'),
    ).toBeVisible();
  });
});
