import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute } from '../../../test/render';
import type { OrgStats } from '../api/useOrgStats';

const ORG_ID = '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13';
const PIKE = 'c0000000-0000-4000-8000-000000000001';
const PERCH = 'c0000000-0000-4000-8000-000000000002';
const ZEGRZE = { id: 'd0000000-0000-4000-8000-000000000001', name: 'Zalew Zegrzyński' };

const profile = {
  id: '6f1c2c9e-0000-4000-8000-000000000001',
  email: 'marek@example.test',
  firstName: 'Marek',
  lastName: 'Lewandowski',
  birthDate: '1971-11-23',
  anglerCardNo: null,
  locale: 'pl',
  isSuperAdmin: false,
};

const species = [
  { id: PERCH, latinName: 'Perca fluviatilis', namePl: 'Okoń', nameEn: 'Perch', nameRu: 'Окунь' },
  { id: PIKE, latinName: 'Esox lucius', namePl: 'Szczupak', nameEn: 'Pike', nameRu: 'Щука' },
].map((kind) => ({ ...kind, isProtected: false }));

const months = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => ({
    month: `2026-${String(from + index).padStart(2, '0')}`,
    count: 0,
    revenueGrosze: 0,
  }));

const statsOf = (data: Partial<OrgStats> = {}): OrgStats => ({
  from: '2026-01-01',
  to: '2026-12-31',
  sales: {
    count: 5,
    revenueGrosze: 37500,
    revokedCount: 1,
    revokedGrosze: 2500,
    byPermitType: [
      {
        permitType: { id: 'a0000000-0000-4000-8000-000000000002', name: 'Roczne' },
        count: 1,
        revenueGrosze: 30000,
        revokedCount: 0,
      },
      {
        permitType: { id: 'a0000000-0000-4000-8000-000000000001', name: 'Dzienne' },
        count: 4,
        revenueGrosze: 7500,
        revokedCount: 1,
      },
    ],
    byMonth: months(1, 12).map((month) =>
      month.month === '2026-10' ? { ...month, count: 5, revenueGrosze: 37500 } : month,
    ),
  },
  catches: {
    count: 7,
    keptCount: 2,
    releasedCount: 5,
    bySpecies: [
      { speciesId: PERCH, count: 5, keptCount: 0 },
      { speciesId: PIKE, count: 2, keptCount: 2 },
    ],
    byWater: [{ water: ZEGRZE, count: 7, keptCount: 2 }],
  },
  ...data,
});

const statsPath = `/api/v1/orgs/${ORG_ID}/stats`;

const asked = (fetch: ReturnType<typeof mockApi>, path = statsPath) =>
  fetch.mock.calls
    .map(([request]) => new URL(request.url))
    .filter((url) => url.pathname === path)
    .map((url) => Object.fromEntries(url.searchParams));

const show = (stats: (request: Request) => Response, extra = {}, path = `/org/${ORG_ID}/stats`) => {
  const fetch = mockApi({
    'GET /api/v1/me': () => jsonResponse(profile),
    'GET /api/v1/species': () => jsonResponse(species),
    [`GET ${statsPath}`]: stats,
    ...extra,
  });
  renderRoute(path, { accessToken: 'access-1' });
  return fetch;
};

describe('statistics of the organization', () => {
  beforeEach(() => {
    // 6 October 2026, 17:20 in Warsaw: the current season is 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the sales of the current season with the figures and the charts', async () => {
    const fetch = show(() => jsonResponse(statsOf()));

    const sales = await screen.findByRole('region', { name: 'Sprzedaż zezwoleń' });
    expect(within(sales).getByText('Sprzedane').nextSibling).toHaveTextContent('5');
    expect(within(sales).getByText('Wpływy', { selector: 'dt' }).nextSibling).toHaveTextContent(
      /^375,00\s*zł$/,
    );
    expect(within(sales).getByText(/^25,00\s*zł$/)).toBeVisible();
    expect(within(sales).getByText(/zwrot odbywa się poza serwisem/)).toBeVisible();
    const columns = within(sales).getByRole('figure', {
      name: 'Sprzedane zezwolenia w miesiącach',
    });
    expect(within(columns).getAllByRole('listitem')).toHaveLength(12);
    expect(
      within(columns).getByText(/^październik 2026: 5 zezwoleń, 375,00\s*zł$/),
    ).toBeInTheDocument();
    expect(within(columns).getByText(/^styczeń 2026: 0 zezwoleń, 0,00\s*zł$/)).toBeInTheDocument();
    const types = within(sales).getByRole('figure', { name: 'Wpływy według rodzaju zezwolenia' });
    expect(
      within(types)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringMatching(/^Roczne1 zezwolenie · 300,00\s*zł$/),
      expect.stringMatching(/^Dzienne4 zezwolenia · 75,00\s*zł$/),
    ]);
    expect(asked(fetch)).toEqual([{ from: '2026-01-01', to: '2026-12-31' }]);
    expect(screen.getByLabelText('Od')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Do')).toHaveValue('2026-12-31');
  });

  it('shows the catches by species in the interface language and by water', async () => {
    show(() => jsonResponse(statsOf()));

    const catches = await screen.findByRole('region', { name: 'Połowy' });
    expect(within(catches).getByText('Wypuszczone').nextSibling).toHaveTextContent('5');
    const bySpecies = await within(catches).findByRole('figure', { name: 'Według gatunku' });
    expect(
      within(bySpecies)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Okoń5 ryb · zabrane: 0', 'Szczupak2 ryby · zabrane: 2']);
    const byWater = within(catches).getByRole('figure', { name: 'Według łowiska' });
    expect(within(byWater).getByText('Zalew Zegrzyński')).toBeVisible();
    expect(within(byWater).getByText('7 ryb · zabrane: 2')).toBeVisible();
  });

  it('says so when the period has no sales and no catches, without empty charts', async () => {
    show(() =>
      jsonResponse(
        statsOf({
          sales: {
            count: 0,
            revenueGrosze: 0,
            revokedCount: 0,
            revokedGrosze: 0,
            byPermitType: [],
            byMonth: months(1, 12),
          },
          catches: { count: 0, keptCount: 0, releasedCount: 0, bySpecies: [], byWater: [] },
        }),
      ),
    );

    expect(
      await screen.findByText('W tym okresie nie sprzedano żadnego zezwolenia.'),
    ).toBeVisible();
    expect(screen.getByText('W tym okresie nie zapisano żadnego połowu.')).toBeVisible();
    expect(screen.queryByRole('figure')).toBeNull();
    expect(screen.queryByText(/zwrot odbywa się poza serwisem/)).toBeNull();
  });

  it('asks for the period typed in and keeps it in the address', async () => {
    const user = userEvent.setup();
    const fetch = show((request) => {
      const { searchParams } = new URL(request.url);
      return jsonResponse(
        statsOf({ from: searchParams.get('from') ?? '', to: searchParams.get('to') ?? '' }),
      );
    });
    await screen.findByRole('region', { name: 'Sprzedaż zezwoleń' });

    await user.clear(screen.getByLabelText('Od'));
    await user.type(screen.getByLabelText('Od'), '2026-10-01');
    await user.clear(screen.getByLabelText('Do'));
    await user.type(screen.getByLabelText('Do'), '2026-10-31');
    await user.click(screen.getByRole('button', { name: 'Pokaż' }));

    await waitFor(() =>
      expect(asked(fetch)).toEqual([
        { from: '2026-01-01', to: '2026-12-31' },
        { from: '2026-10-01', to: '2026-10-31' },
      ]),
    );
    expect(screen.getByLabelText('Od')).toHaveValue('2026-10-01');
  });

  it('starts from the period in the address', async () => {
    const fetch = show(
      () => jsonResponse(statsOf()),
      {},
      `/org/${ORG_ID}/stats?from=2025-06-01&to=2025-08-31`,
    );

    await screen.findByRole('region', { name: 'Sprzedaż zezwoleń' });

    expect(asked(fetch)).toEqual([{ from: '2025-06-01', to: '2025-08-31' }]);
  });

  it('falls back to the season for a wrong period in the address', async () => {
    const fetch = show(
      () => jsonResponse(statsOf()),
      {},
      `/org/${ORG_ID}/stats?from=2026-10-06&to=2026-01-01`,
    );

    await screen.findByRole('region', { name: 'Sprzedaż zezwoleń' });

    expect(asked(fetch)).toEqual([{ from: '2026-01-01', to: '2026-12-31' }]);
  });

  it('refuses a period longer than 366 days before asking', async () => {
    const user = userEvent.setup();
    const fetch = show(() => jsonResponse(statsOf()));
    await screen.findByRole('region', { name: 'Sprzedaż zezwoleń' });

    await user.clear(screen.getByLabelText('Do'));
    await user.type(screen.getByLabelText('Do'), '2027-01-02');
    await user.click(screen.getByRole('button', { name: 'Pokaż' }));

    expect(await screen.findByText('Okres może trwać najwyżej 366 dni.')).toBeVisible();
    expect(screen.getByLabelText('Do')).toHaveAttribute('aria-invalid', 'true');
    expect(asked(fetch)).toHaveLength(1);
  });

  it('marks only the start when only the start is wrong', async () => {
    const user = userEvent.setup();
    const fetch = show(() => jsonResponse(statsOf()));
    await screen.findByRole('region', { name: 'Sprzedaż zezwoleń' });

    await user.clear(screen.getByLabelText('Od'));
    await user.click(screen.getByRole('button', { name: 'Pokaż' }));

    expect(await screen.findByText('Podaj prawidłową datę.')).toBeVisible();
    expect(screen.getByLabelText('Od')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Do')).not.toHaveAttribute('aria-invalid');
    expect(asked(fetch)).toHaveLength(1);
  });

  it('shows the count and the revenue of every month in a table on demand', async () => {
    const user = userEvent.setup();
    show(() => jsonResponse(statsOf()));

    await user.click(await screen.findByText('Pokaż miesiące w tabeli'));

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    const october = within(table).getByRole('row', { name: /październik 2026/ });
    expect(october).toBeVisible();
    expect(
      within(october)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['5', expect.stringMatching(/^375,00\s*zł$/)]);
  });

  it('translates a refusal of the API', async () => {
    show(() => jsonResponse({ code: 'FORBIDDEN', message: 'Missing role', details: {} }, 403));

    expect(await screen.findByRole('alert')).toHaveTextContent(/uprawnień/i);
  });

  describe('catch export', () => {
    let click: Mock<(this: HTMLAnchorElement) => void>;

    beforeEach(() => {
      click = vi.fn<(this: HTMLAnchorElement) => void>();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
      // jsdom has no object URLs.
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: vi.fn() });
    });

    it('downloads the CSV of the period shown with the access token', async () => {
      const csvPath = `/api/v1/orgs/${ORG_ID}/catches.csv`;
      const fetch = show(() => jsonResponse(statsOf()), {
        [`GET ${csvPath}`]: () =>
          new Response('\uFEFFData;Godzina\r\n', {
            headers: { 'Content-Type': 'text/csv; charset=utf-8' },
          }),
      });

      await userEvent.click(await screen.findByRole('button', { name: 'Pobierz plik CSV' }));

      await waitFor(() => expect(click).toHaveBeenCalledOnce());
      expect(click.mock.contexts[0]?.download).toBe('polowy-2026-01-01-2026-12-31.csv');
      expect(asked(fetch, csvPath)).toEqual([{ from: '2026-01-01', to: '2026-12-31' }]);
      const request = fetch.mock.calls
        .map(([sent]) => sent)
        .find((sent) => new URL(sent.url).pathname === csvPath);
      expect(request?.headers.get('Authorization')).toBe('Bearer access-1');
    });

    it('translates a refused export and saves nothing', async () => {
      show(() => jsonResponse(statsOf()), {
        [`GET /api/v1/orgs/${ORG_ID}/catches.csv`]: () =>
          jsonResponse({ code: 'ORG_NOT_ACTIVE', message: 'Blocked', details: {} }, 403),
      });

      await userEvent.click(await screen.findByRole('button', { name: 'Pobierz plik CSV' }));

      const exportCard = screen.getByRole('region', { name: 'Eksport połowów' });
      expect(await within(exportCard).findByRole('alert')).toBeVisible();
      expect(click).not.toHaveBeenCalled();
    });
  });
});
