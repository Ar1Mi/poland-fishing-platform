import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute } from '../../../test/render';
import type { MyStats } from '../api/useMyStats';

const PIKE = 'c0000000-0000-4000-8000-000000000001';
const PERCH = 'c0000000-0000-4000-8000-000000000002';
const ZEGRZE = { id: 'd0000000-0000-4000-8000-000000000001', name: 'Zalew Zegrzyński' };
const NAREW = { id: 'd0000000-0000-4000-8000-000000000002', name: 'Narew' };

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

const species = [
  { id: PERCH, latinName: 'Perca fluviatilis', namePl: 'Okoń', nameEn: 'Perch', nameRu: 'Окунь' },
  { id: PIKE, latinName: 'Esox lucius', namePl: 'Szczupak', nameEn: 'Pike', nameRu: 'Щука' },
].map((kind) => ({ ...kind, isProtected: false }));

const statsOf = (season: number, data: Partial<MyStats['catches']> = {}): MyStats => ({
  season,
  from: `${season}-01-01`,
  to: `${season}-12-31`,
  catches: {
    count: 3,
    keptCount: 2,
    releasedCount: 1,
    bySpecies: [
      { speciesId: PIKE, count: 2, keptCount: 1 },
      { speciesId: PERCH, count: 1, keptCount: 1 },
    ],
    byWater: [
      { water: ZEGRZE, count: 2, keptCount: 1 },
      { water: NAREW, count: 1, keptCount: 1 },
    ],
    ...data,
  },
});

const asked = (fetch: ReturnType<typeof mockApi>) =>
  fetch.mock.calls
    .map(([request]) => new URL(request.url))
    .filter((url) => url.pathname === '/api/v1/me/stats')
    .map((url) => Object.fromEntries(url.searchParams));

// 6 October 2026 in Warsaw: the current season is 2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const page = (handlers: Record<string, () => Response> = {}) =>
  mockApi({
    'GET /api/v1/me': () => jsonResponse(profile),
    'GET /api/v1/me/orgs': () => jsonResponse([]),
    'GET /api/v1/species': () => jsonResponse(species),
    'GET /api/v1/me/stats': () => jsonResponse(statsOf(2026)),
    ...handlers,
  });

describe('MyStatsPage', () => {
  it('shows the figures of the current season by species and water', async () => {
    const fetch = page();

    renderRoute('/me/stats', { accessToken: 'token' });

    const card = await screen.findByRole('region', { name: 'Połowy w sezonie 2026' });
    expect(within(card).getByText('Połowy').nextSibling).toHaveTextContent('3');
    expect(within(card).getByText('Zabrane').nextSibling).toHaveTextContent('2');
    expect(within(card).getByText('Wypuszczone').nextSibling).toHaveTextContent('1');
    const bySpecies = await within(card).findByRole('figure', { name: 'Według gatunku' });
    expect(
      within(bySpecies)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Szczupak2 ryby · zabrane: 1', 'Okoń1 ryba · zabrane: 1']);
    const byWater = within(card).getByRole('figure', { name: 'Według łowiska' });
    expect(
      within(byWater)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Zalew Zegrzyński2 ryby · zabrane: 1', 'Narew1 ryba · zabrane: 1']);
    // The current season is asked for without a parameter.
    expect(asked(fetch)).toEqual([{}]);
    expect(screen.getByRole('link', { name: 'Wróć do rejestru' })).toHaveAttribute(
      'href',
      '/me/catches',
    );
  });

  it('browses an earlier season from the address and the select', async () => {
    const fetch = page({
      'GET /api/v1/me/stats': () =>
        jsonResponse(statsOf(2025, { count: 0, keptCount: 0, releasedCount: 0 })),
    });

    renderRoute('/me/stats?season=2025', { accessToken: 'token' });

    expect(await screen.findByRole('region', { name: 'Połowy w sezonie 2025' })).toBeVisible();
    expect(screen.getByText('W tym okresie nie zapisano żadnego połowu.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Sezon' })).toHaveValue('2025');
    expect(screen.getByRole('link', { name: 'Wróć do rejestru' })).toHaveAttribute(
      'href',
      '/me/catches?season=2025',
    );

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sezon' }), '2026');

    expect(asked(fetch)).toEqual([{ season: '2025' }, {}]);
  });

  it('sends a guest to the login page', async () => {
    page();

    renderRoute('/me/stats');

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });
});
