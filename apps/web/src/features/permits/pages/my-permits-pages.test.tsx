import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute } from '../../../test/render';
import type { MyPermit } from '../api/usePurchase';

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
const session = {
  'GET /api/v1/me': () => jsonResponse(profile),
  'GET /api/v1/me/orgs': () => jsonResponse([]),
};

const permitOf = (n: number, changes: Partial<MyPermit>): MyPermit => ({
  id: `5e1c2c9e-0000-4000-8000-00000000010${n}`,
  number: `ZW-2026-00012${n}`,
  status: 'ACTIVE',
  validFrom: '2026-10-05',
  validTo: '2026-10-11',
  pricePaidGrosze: 4000,
  permitType: {
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Tygodniowe',
    durationDays: 7,
    discountKind: 'NONE',
  },
  organization: { id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13', name: 'Koło PZW 7' },
  createdAt: '2026-10-01T10:00:00.000Z',
  qrToken: 'header.payload.signature',
  ...changes,
});

const active = permitOf(1, {});
const expired = permitOf(2, {
  status: 'EXPIRED',
  permitType: { ...active.permitType, name: 'Dzienne' },
  validFrom: '2026-09-01',
  validTo: '2026-09-01',
  qrToken: null,
});

describe('my permits page', () => {
  it('splits permits into current and past, each linking to its QR', async () => {
    mockApi({ ...session, 'GET /api/v1/me/permits': () => jsonResponse([active, expired]) });
    renderRoute('/me/permits', { accessToken: 'access-1' });

    const current = await screen.findByRole('region', { name: 'Aktualne' });
    const past = screen.getByRole('region', { name: 'Archiwalne' });
    const activeLink = within(current).getByRole('link', { name: /Tygodniowe/ });
    expect(activeLink).toHaveAttribute('href', `/me/permits/${active.id}`);
    expect(within(activeLink).getByText('Aktywne')).toBeVisible();
    expect(within(activeLink).getByText('ZW-2026-000121')).toBeVisible();
    expect(within(past).getByRole('link', { name: /Dzienne/ })).toHaveTextContent('Wygasłe');
  });

  it('points to the catalog when there are no permits', async () => {
    mockApi({ ...session, 'GET /api/v1/me/permits': () => jsonResponse([]) });
    renderRoute('/me/permits', { accessToken: 'access-1' });

    expect(await screen.findByText('Nie masz jeszcze żadnego zezwolenia.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Znajdź łowisko na mapie' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('is reachable from the account menu', async () => {
    mockApi({ ...session, 'GET /api/v1/me/permits': () => jsonResponse([]) });
    renderRoute('/me/permits', { accessToken: 'access-1' });

    expect(await screen.findByRole('link', { name: 'Moje zezwolenia' })).toHaveAttribute(
      'href',
      '/me/permits',
    );
  });

  it('sends a guest to the login page', async () => {
    mockApi({});
    renderRoute('/me/permits');

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });
});

describe('my permit page', () => {
  let click: Mock<(this: HTMLAnchorElement) => void>;

  beforeEach(() => {
    click = vi.fn<(this: HTMLAnchorElement) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    // jsdom has no object URLs.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:permit'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const show = (permit: MyPermit, extra = {}) => {
    const fetch = mockApi({
      ...session,
      [`GET /api/v1/me/permits/${permit.id}`]: () => jsonResponse(permit),
      ...extra,
    });
    renderRoute(`/me/permits/${permit.id}`, { accessToken: 'access-1' });
    return fetch;
  };

  it('shows the QR code with the number, validity and status', async () => {
    show(active);

    expect(await screen.findByTitle('Kod QR zezwolenia ZW-2026-000121')).toBeInTheDocument();
    expect(screen.getByText('ZW-2026-000121')).toBeVisible();
    expect(screen.getByText('Aktywne')).toBeVisible();
    expect(screen.getByText('Ważne od 5 paź 2026 do 11 paź 2026 włącznie')).toBeVisible();
  });

  it('opens the QR over the whole screen and closes it with Escape, returning focus', async () => {
    show(active);
    const open = await screen.findByRole('button', { name: 'Pokaż kod na pełnym ekranie' });

    await userEvent.click(open);

    const dialog = screen.getByRole('dialog', { name: 'Pokaż kod kontrolerowi' });
    expect(within(dialog).getByText('ZW-2026-000121')).toBeVisible();
    expect(
      within(dialog).getByText('Zwiększ jasność ekranu, aby kod łatwiej się skanował.'),
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Zamknij' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('closes the full-screen QR with its button', async () => {
    show(active);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Pokaż kod na pełnym ekranie' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('downloads the PDF with the access token, named by the permit number', async () => {
    const fetch = show(active, {
      [`GET /api/v1/me/permits/${active.id}/pdf`]: () =>
        new Response('%PDF-1.3', { headers: { 'Content-Type': 'application/pdf' } }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.contexts[0]?.download).toBe('ZW-2026-000121.pdf');
    const request = fetch.mock.calls
      .map(([sent]) => sent)
      .find((sent) => new URL(sent.url).pathname.endsWith('/pdf'));
    expect(request?.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('shows neither QR nor PDF for an expired permit', async () => {
    show(expired);

    expect(await screen.findByText('Wygasłe')).toBeVisible();
    expect(screen.queryByTitle(/Kod QR/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pobierz PDF' })).not.toBeInTheDocument();
  });

  it('translates an API error', async () => {
    mockApi({
      ...session,
      [`GET /api/v1/me/permits/${active.id}`]: () =>
        jsonResponse({ code: 'NOT_FOUND', message: 'Permit not found' }, 404),
    });
    renderRoute(`/me/permits/${active.id}`, { accessToken: 'access-1' });

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Wszystkie zezwolenia' })).toBeVisible();
  });
});
