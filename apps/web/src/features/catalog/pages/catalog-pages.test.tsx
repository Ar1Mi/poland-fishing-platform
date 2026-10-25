import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute } from '../../../test/render';
import type { WaterDetail, WaterSummary } from '../api/useWaters';
import { POLAND_BBOX } from '../lib/map';
import { LIST_LIMIT } from './CatalogPage';

interface MapProps {
  waters: WaterSummary[];
  fitToWaters: boolean;
  onBoundsChange: (bbox: string) => void;
}

// Leaflet needs a real layout (bboxOf has its own test; the map was checked in a browser).
// The stand-in reports the initial view of Poland, as the map does once laid out.
vi.mock('../components/WatersMap', () => ({
  WatersMap: ({ waters, fitToWaters, onBoundsChange }: MapProps) => {
    useEffect(() => onBoundsChange(POLAND_BBOX), [onBoundsChange]);
    return (
      <div data-testid="map" data-fit={String(fitToWaters)}>
        {waters.length}
      </div>
    );
  },
}));

const zegrze: WaterSummary = {
  id: '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11',
  name: 'Zalew Zegrzyński',
  type: 'RESERVOIR',
  status: 'UNCLAIMED',
  region: 'mazowieckie',
  lat: 52.46,
  lng: 21.04,
};
const connected: WaterSummary = {
  id: '1c9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a12',
  name: 'Jezioro Białe',
  type: 'LAKE',
  status: 'CONNECTED',
  region: 'mazowieckie',
  lat: 52.1,
  lng: 21.9,
};

const watersList =
  (items: WaterSummary[], truncated = false) =>
  () =>
    jsonResponse({ items, truncated });

const queryOf = (fetch: ReturnType<typeof mockApi>) =>
  fetch.mock.calls
    .map(([request]) => new URL(request.url))
    .filter((url) => url.pathname === '/api/v1/waters')
    .map((url) => Object.fromEntries(url.searchParams));

describe('catalogue page', () => {
  it('lists waters in the initial map view with their type and status', async () => {
    const fetch = mockApi({ 'GET /api/v1/waters': watersList([connected, zegrze]) });

    renderRoute('/');

    const list = await screen.findByRole('list');
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/waters/${connected.id}`,
      `/waters/${zegrze.id}`,
    ]);
    expect(within(links[0]!).getByText('Zezwolenia online')).toBeVisible();
    expect(within(links[1]!).getByText('Tylko rejestr')).toBeVisible();
    expect(within(links[1]!).getByText('Zbiornik zaporowy · mazowieckie')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Łowiska w widoku mapy (2)' })).toBeVisible();
    expect(queryOf(fetch)).toEqual([{ bbox: POLAND_BBOX }]);
  });

  it('applies the selects at once and keeps them in the URL', async () => {
    const fetch = mockApi({ 'GET /api/v1/waters': watersList([connected]) });
    renderRoute('/');
    await screen.findByRole('list');

    await userEvent.selectOptions(screen.getByLabelText('Zezwolenia'), 'Zezwolenia online');
    await userEvent.selectOptions(screen.getByLabelText('Rodzaj'), 'Jezioro');

    await vi.waitFor(() =>
      expect(queryOf(fetch).at(-1)).toEqual({
        status: 'CONNECTED',
        type: 'LAKE',
        bbox: POLAND_BBOX,
      }),
    );
  });

  it('reads the filters from the URL and ignores unknown values', async () => {
    const fetch = mockApi({ 'GET /api/v1/waters': watersList([]) });

    renderRoute('/?region=pomorskie&type=SEA&status=CONNECTED');

    expect(await screen.findByText('Brak łowisk spełniających kryteria.')).toBeVisible();
    expect(screen.getByLabelText('Województwo')).toHaveValue('pomorskie');
    expect(screen.getByLabelText('Rodzaj')).toHaveValue('');
    expect(queryOf(fetch)).toEqual([
      { region: 'pomorskie', status: 'CONNECTED', bbox: POLAND_BBOX },
    ]);
  });

  it('searches by name in the whole catalogue and zooms the map to the results', async () => {
    const fetch = mockApi({ 'GET /api/v1/waters': watersList([zegrze]) });
    renderRoute('/');
    await screen.findByRole('list');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Nazwa łowiska' }), ' zegrz ');
    await userEvent.click(screen.getByRole('button', { name: 'Szukaj' }));

    expect(await screen.findByRole('heading', { name: 'Łowiska (1)' })).toBeVisible();
    expect(queryOf(fetch).at(-1)).toEqual({ q: 'zegrz' });
    expect(screen.getByTestId('map')).toHaveAttribute('data-fit', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));

    await vi.waitFor(() => expect(queryOf(fetch).at(-1)).toEqual({ bbox: POLAND_BBOX }));
    expect(screen.getByRole('searchbox', { name: 'Nazwa łowiska' })).toHaveValue('');
  });

  it('asks to zoom in when the API truncated the list', async () => {
    mockApi({ 'GET /api/v1/waters': watersList([zegrze], true) });

    renderRoute('/');

    expect(await screen.findByText(/Przybliż mapę lub zawęź filtry/)).toBeVisible();
  });

  it('asks for a more precise name when a search was truncated (zooming does not help)', async () => {
    mockApi({ 'GET /api/v1/waters': watersList([zegrze], true) });

    renderRoute('/?q=staw');

    expect(await screen.findByText(/Wpisz dokładniejszą nazwę/)).toBeVisible();
    expect(screen.queryByText(/Przybliż mapę/)).not.toBeInTheDocument();
  });

  it(`renders at most ${LIST_LIMIT} entries and says how many there are`, async () => {
    const many = Array.from({ length: LIST_LIMIT + 5 }, (_, i) => ({
      ...zegrze,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `Staw ${i}`,
    }));
    mockApi({ 'GET /api/v1/waters': watersList(many) });

    renderRoute('/');

    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(LIST_LIMIT);
    expect(
      screen.getByText(`Pokazano ${LIST_LIMIT} z ${LIST_LIMIT + 5}.`, { exact: false }),
    ).toBeVisible();
    expect(screen.getByTestId('map')).toHaveTextContent(String(LIST_LIMIT + 5));
  });

  it('shows a translated message with the code when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderRoute('/');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Brak połączenia z serwerem/)).toBeVisible();
    expect(within(alert).getByText('NETWORK_ERROR')).toBeVisible();
  });
});

const detail = (data: Partial<WaterDetail>): WaterDetail => ({
  ...zegrze,
  description: null,
  organization: null,
  externalOwnerName: null,
  externalInfoUrl: null,
  source: 'RZGW',
  updatedAt: '2026-10-24T23:30:00.000Z',
  ...data,
});

describe('water page', () => {
  const show = (water: WaterDetail) => {
    mockApi({ [`GET /api/v1/waters/${water.id}`]: () => jsonResponse(water) });
    renderRoute(`/waters/${water.id}`);
  };

  it('shows the użytkownik rybacki of an unclaimed water and a link to its site', async () => {
    show(
      detail({
        externalOwnerName: 'RZGW Warszawa',
        externalInfoUrl: 'https://www.gov.pl/web/wody-polskie',
        description: 'Zbiornik na Narwi',
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zalew Zegrzyński' }),
    ).toBeVisible();
    expect(screen.getByText('RZGW Warszawa')).toBeVisible();
    expect(screen.getByText(/kupisz u użytkownika rybackiego/)).toBeVisible();
    const link = screen.getByRole('link', { name: /Regulamin i zezwolenia u zarządcy/ });
    expect(link).toHaveAttribute('href', 'https://www.gov.pl/web/wody-polskie');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Zbiornik na Narwi')).toBeVisible();
    // Updated at 01:30 on 25 October in Warsaw.
    expect(
      screen.getByText('Źródło danych: RZGW Wody Polskie, aktualizacja 25 paź 2026'),
    ).toBeVisible();
  });

  it('says that online sales are suspended while the organization is blocked', async () => {
    show(
      detail({
        status: 'CONNECTED',
        organization: {
          id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13',
          name: 'Koło PZW nr 12',
          isActive: false,
        },
      }),
    );

    expect(await screen.findByText('Sprzedaż online wstrzymana')).toBeVisible();
    expect(screen.getByText('Koło PZW nr 12')).toBeVisible();
    expect(screen.getByText(/jest obecnie wstrzymana/)).toBeVisible();
    expect(screen.queryByText('Zezwolenia online')).not.toBeInTheDocument();
  });

  it('shows the organization of a connected water and no external link', async () => {
    show(
      detail({
        status: 'CONNECTED',
        organization: {
          id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13',
          name: 'Koło PZW nr 12',
          isActive: true,
        },
        externalOwnerName: 'RZGW Warszawa',
        externalInfoUrl: 'https://www.gov.pl/web/wody-polskie',
      }),
    );

    expect(await screen.findByText('Koło PZW nr 12')).toBeVisible();
    expect(screen.getByText('Zezwolenia online')).toBeVisible();
    expect(screen.getByText(/sprzedaje zezwolenia w serwisie/)).toBeVisible();
    expect(screen.queryByRole('link', { name: /u zarządcy/ })).not.toBeInTheDocument();
  });

  it('does not turn a non-http link from the catalogue into a link', async () => {
    show(detail({ externalInfoUrl: 'javascript:alert(1)' }));

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('link', { name: /u zarządcy/ })).not.toBeInTheDocument();
    expect(screen.getByText('Brak danych o użytkowniku rybackim.')).toBeVisible();
  });

  it('says when a water has no position on the map', async () => {
    show(detail({ lat: null, lng: null }));

    expect(await screen.findByText('Brak położenia na mapie.')).toBeVisible();
  });

  it('shows NOT_FOUND for an unknown water, with a way back to the map', async () => {
    const id = '3e9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a14';
    mockApi({
      [`GET /api/v1/waters/${id}`]: () =>
        jsonResponse({ code: 'NOT_FOUND', message: 'Water not found' }, 404),
    });

    renderRoute(`/waters/${id}`);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('NOT_FOUND')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Wróć do mapy' })).toHaveAttribute('href', '/');
  });

  describe('claim offer', () => {
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
    const org = (id: string, name: string, status = 'ACTIVE', roles = ['ORG_ADMIN']) => ({
      id,
      name,
      kind: 'PZW',
      status,
      roles,
    });
    const showLoggedIn = (water: WaterDetail, orgs: unknown[]) => {
      const fetch = mockApi({
        [`GET /api/v1/waters/${water.id}`]: () => jsonResponse(water),
        'GET /api/v1/me': () => jsonResponse(profile),
        'GET /api/v1/me/orgs': () => jsonResponse(orgs),
      });
      renderRoute(`/waters/${water.id}`, { accessToken: 'access-1' });
      return fetch;
    };
    /** Absence of the offer means something only once /me/orgs has answered and rendered. */
    const orgsAnswered = async (fetch: ReturnType<typeof mockApi>) => {
      await waitFor(() =>
        expect(
          fetch.mock.calls.some(([request]) => new URL(request.url).pathname === '/api/v1/me/orgs'),
        ).toBe(true),
      );
      await act(() => Promise.resolve());
    };
    const ORG_A = '7a1c2c9e-0000-4000-8000-0000000000aa';
    const ORG_B = '7a1c2c9e-0000-4000-8000-0000000000bb';

    it('lets the admin of an active organization claim an unclaimed water', async () => {
      showLoggedIn(detail({}), [org(ORG_A, 'Koło 12')]);

      expect(await screen.findByRole('link', { name: 'Złóż wniosek o łowisko' })).toHaveAttribute(
        'href',
        `/org/${ORG_A}/claims?waterId=${zegrze.id}`,
      );
    });

    it('names the organization when the admin has several', async () => {
      showLoggedIn(detail({}), [org(ORG_A, 'Koło 12'), org(ORG_B, 'Gospodarstwo Rybackie')]);

      expect(await screen.findByRole('link', { name: 'Złóż wniosek jako Koło 12' })).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Złóż wniosek jako Gospodarstwo Rybackie' }),
      ).toBeVisible();
    });

    it('offers nothing to an inspector or to an organization that is not active', async () => {
      const fetch = showLoggedIn(detail({}), [
        org(ORG_A, 'Koło 12', 'PENDING'),
        org(ORG_B, 'Gospodarstwo Rybackie', 'ACTIVE', ['INSPECTOR']),
      ]);

      await screen.findByRole('heading', { level: 1, name: zegrze.name });
      await orgsAnswered(fetch);
      expect(screen.queryByText('Zarządzasz tym łowiskiem?')).toBeNull();
    });

    it('offers nothing on a connected water', async () => {
      showLoggedIn(
        detail({
          status: 'CONNECTED',
          organization: { id: ORG_B, name: 'Koło 7', isActive: true },
        }),
        [org(ORG_A, 'Koło 12')],
      );

      // Rendered together with the owner: the offer is not even mounted for a connected water.
      expect(await screen.findByText('Koło 7')).toBeVisible();
      expect(screen.queryByText('Zarządzasz tym łowiskiem?')).toBeNull();
    });
  });
});
