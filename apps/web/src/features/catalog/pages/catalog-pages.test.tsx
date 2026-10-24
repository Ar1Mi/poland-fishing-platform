import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute } from '../../../test/render';
import type { WaterDetail, WaterSummary } from '../api/useWaters';
import { POLAND_BBOX } from '../lib/map';
import { LIST_LIMIT } from './CatalogPage';

// Leaflet needs a real layout; the map gets its own browser check. Here it only shows what it got.
vi.mock('../components/WatersMap', () => ({
  WatersMap: ({ waters, fitToWaters }: { waters: WaterSummary[]; fitToWaters: boolean }) => (
    <div data-testid="map" data-fit={String(fitToWaters)}>
      {waters.length}
    </div>
  ),
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

  it('shows the organization of a connected water and no external link', async () => {
    show(
      detail({
        status: 'CONNECTED',
        organization: { id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13', name: 'Koło PZW nr 12' },
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
});
