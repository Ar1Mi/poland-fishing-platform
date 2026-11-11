import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { AdminWater } from '../api/useWaterSuggestions';

// Leaflet needs a real layout: the picker is replaced by a button that places the marker
// where a tap on the map would; the coordinate fields next to it are tested for real.
vi.mock('../components/PositionPicker', () => ({
  PositionPicker: ({
    value,
    onChange,
    label,
  }: {
    value: { lat: number; lng: number } | null;
    onChange: (position: { lat: number; lng: number }) => void;
    label: string;
  }) => (
    <button type="button" aria-label={label} onClick={() => onChange({ lat: 52.4, lng: 21.0 })}>
      {value ? `${value.lat},${value.lng}` : 'no marker'}
    </button>
  ),
}));

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

const session = (
  handlers: Record<string, (request: Request) => Response | Promise<Response>> = {},
) =>
  mockApi({
    'GET /api/v1/me': () => jsonResponse(profile),
    'GET /api/v1/me/orgs': () => jsonResponse([]),
    ...handlers,
  });

const suggested = (body: Record<string, unknown>) => ({
  id: '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11',
  status: 'UNCLAIMED',
  description: null,
  seasonInfo: null,
  photoVersion: null,
  organization: null,
  externalOwnerName: null,
  externalInfoUrl: null,
  source: 'USER',
  importedAt: null,
  ...body,
});

describe('suggest water page', () => {
  it('sends a guest to the login page', async () => {
    mockApi({});

    renderRoute('/waters/suggest');

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });

  it('sends the fields and the position placed on the map, then thanks the angler', async () => {
    const fetch = session({
      'POST /api/v1/waters/suggestions': async (request) =>
        jsonResponse(suggested((await request.clone().json()) as Record<string, unknown>), 201),
    });

    renderRoute('/waters/suggest', { accessToken: 'token' });

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Nazwa łowiska' }),
      'Staw Dolny',
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rodzaj' }), 'Staw');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Województwo' }),
      'mazowieckie',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mapa: wybierz położenie łowiska' }));
    expect(screen.getByRole('spinbutton', { name: 'Szerokość (lat)' })).toHaveValue(52.4);
    expect(screen.getByRole('spinbutton', { name: 'Długość (lng)' })).toHaveValue(21);
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij propozycję' }));

    expect(await screen.findByText('Propozycja wysłana')).toHaveFocus();
    expect(
      screen.getByText(
        'Dziękujemy! Łowisko „Staw Dolny” pojawi się na mapie po sprawdzeniu przez administratora serwisu.',
      ),
    ).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/waters/suggestions')).toEqual([
      { name: 'Staw Dolny', type: 'POND', region: 'mazowieckie', lat: 52.4, lng: 21 },
    ]);
    expect(screen.getByRole('link', { name: 'Zobacz mapę łowisk' })).toHaveAttribute('href', '/');

    await userEvent.click(screen.getByRole('button', { name: 'Zaproponuj kolejne łowisko' }));

    expect(screen.getByRole('textbox', { name: 'Nazwa łowiska' })).toHaveValue('');
  });

  it('refuses an empty form and a position outside Poland before sending', async () => {
    const fetch = session();

    renderRoute('/waters/suggest', { accessToken: 'token' });

    await userEvent.click(await screen.findByRole('button', { name: 'Wyślij propozycję' }));

    expect(screen.getByRole('textbox', { name: 'Nazwa łowiska' })).toHaveAccessibleDescription(
      'Nazwa musi mieć co najmniej 2 znaki.',
    );
    expect(screen.getByRole('combobox', { name: 'Rodzaj' })).toHaveAccessibleDescription(
      'To pole jest wymagane.',
    );
    expect(screen.getByRole('combobox', { name: 'Województwo' })).toHaveAccessibleDescription(
      'To pole jest wymagane.',
    );
    expect(screen.getByRole('spinbutton', { name: 'Szerokość (lat)' })).toHaveAccessibleDescription(
      'To pole jest wymagane.',
    );

    // Typed coordinates reach the map as well; swapped ones are refused on the lat field.
    await userEvent.type(screen.getByRole('textbox', { name: 'Nazwa łowiska' }), 'Staw Dolny');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rodzaj' }), 'Staw');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Województwo' }),
      'mazowieckie',
    );
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Szerokość (lat)' }), '21');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Długość (lng)' }), '52.4');
    expect(
      screen.getByRole('button', { name: 'Mapa: wybierz położenie łowiska' }),
    ).toHaveTextContent('21,52.4');
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij propozycję' }));

    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: 'Szerokość (lat)' }),
      ).toHaveAccessibleDescription('Położenie musi leżeć w Polsce.'),
    );
    expect(fetch.mock.calls.some(([request]) => request.method === 'POST')).toBe(false);
  });

  it('is linked from the catalogue', async () => {
    mockApi({ 'GET /api/v1/waters': () => jsonResponse({ items: [], truncated: false }) });

    renderRoute('/');

    expect(
      await screen.findByRole('link', { name: 'Nie ma Twojego łowiska na mapie? Zaproponuj je' }),
    ).toHaveAttribute('href', '/waters/suggest');
  });
});

describe('admin waters page', () => {
  const admin = { ...profile, isSuperAdmin: true };
  const pond: AdminWater = {
    id: '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11',
    name: 'staw dolny',
    type: 'POND',
    status: 'UNCLAIMED',
    region: 'mazowieckie',
    lat: 52.4,
    lng: 21,
    source: 'USER',
    sourceRef: '7a000000-0000-4000-8000-000000000001',
    isPublished: false,
    externalOwnerName: null,
    externalInfoUrl: null,
    importedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
  };
  const publishedQuery = (fetch: ReturnType<typeof mockApi>) =>
    fetch.mock.calls
      .map(([request]) => new URL(request.url))
      .filter((url) => url.pathname === '/api/v1/admin/waters')
      .map((url) => url.searchParams.get('published'));

  const page = (handlers: Record<string, () => Response | Promise<Response>> = {}) =>
    mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
      'GET /api/v1/admin/waters': () => jsonResponse([pond]),
      ...handlers,
    });

  it('lists the suggestions with their position and the admin navigation', async () => {
    const fetch = page();

    renderRoute('/admin/waters', { accessToken: 'token' });

    const card = await screen.findByRole('region', { name: 'staw dolny' });
    expect(within(card).getByText('Staw · mazowieckie')).toBeVisible();
    expect(within(card).getByText('52.4, 21')).toBeVisible();
    expect(within(card).getByText('1 paź 2026')).toBeVisible();
    expect(within(card).getByRole('link', { name: /Zobacz na OpenStreetMap/ })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/?mlat=52.4&mlon=21#map=14/52.4/21',
    );
    expect(publishedQuery(fetch)).toEqual(['false']);
    expect(
      within(screen.getByRole('navigation', { name: 'Administracja serwisu' })).getByRole('link', {
        name: 'Propozycje łowisk',
      }),
    ).toHaveAttribute('href', '/admin/waters');
  });

  it('publishes with the corrected fields, sending only what changed', async () => {
    let queue = [pond];
    const fetch = page({
      'GET /api/v1/admin/waters': () => jsonResponse(queue),
      'PATCH /api/v1/admin/waters/0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11': () => {
        queue = [];
        return jsonResponse({ ...pond, name: 'Staw Dolny', type: 'LAKE', isPublished: true });
      },
    });

    renderRoute('/admin/waters', { accessToken: 'token' });

    const card = await screen.findByRole('region', { name: 'staw dolny' });
    const name = within(card).getByRole('textbox', { name: 'Nazwa łowiska' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Staw Dolny');
    await userEvent.selectOptions(
      within(card).getByRole('combobox', { name: 'Rodzaj' }),
      'Jezioro',
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Opublikuj' }));

    const notice = await screen.findByText(/Opublikowano łowisko „Staw Dolny”/);
    expect(notice.closest('[tabindex]')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Zobacz kartę łowiska' })).toHaveAttribute(
      'href',
      '/waters/0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11',
    );
    expect(
      await sentBodies(fetch, 'PATCH /api/v1/admin/waters/0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11'),
    ).toEqual([{ name: 'Staw Dolny', type: 'LAKE', isPublished: true }]);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'staw dolny' })).toBeNull());
    expect(screen.getByText('Nie ma propozycji do sprawdzenia.')).toBeVisible();
  });

  it('rejects after a second confirmation, and the confirmation can be cancelled', async () => {
    let queue = [pond];
    const fetch = page({
      'GET /api/v1/admin/waters': () => jsonResponse(queue),
      'DELETE /api/v1/admin/waters/0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11': () => {
        queue = [];
        return noContent();
      },
    });

    renderRoute('/admin/waters', { accessToken: 'token' });

    const card = await screen.findByRole('region', { name: 'staw dolny' });
    await userEvent.click(within(card).getByRole('button', { name: 'Odrzuć' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Anuluj' }));
    expect(fetch.mock.calls.some(([request]) => request.method === 'DELETE')).toBe(false);

    await userEvent.click(within(card).getByRole('button', { name: 'Odrzuć' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Tak, odrzuć' }));

    expect(await screen.findByText('Odrzucono propozycję „staw dolny”.')).toBeVisible();
    expect(fetch.mock.calls.some(([request]) => request.method === 'DELETE')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'staw dolny' })).toBeNull());
  });

  it('shows the translated refusal of the API', async () => {
    page({
      'DELETE /api/v1/admin/waters/0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11': () =>
        jsonResponse({ code: 'WATER_IN_USE', message: 'The water is referenced' }, 409),
    });

    renderRoute('/admin/waters', { accessToken: 'token' });

    const card = await screen.findByRole('region', { name: 'staw dolny' });
    await userEvent.click(within(card).getByRole('button', { name: 'Odrzuć' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Tak, odrzuć' }));

    expect(
      await within(card).findByText(
        'Tego łowiska nie można usunąć: jest opublikowane albo są z nim powiązane wnioski, zezwolenia lub połowy.',
      ),
    ).toBeVisible();
  });
});
