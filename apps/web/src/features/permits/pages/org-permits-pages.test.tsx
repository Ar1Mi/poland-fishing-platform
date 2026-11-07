import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderRoute, sentBodies } from '../../../test/render';
import type { OrgPermit } from '../api/useOrgPermits';

const ORG_ID = '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13';

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

const permit = (data: Partial<OrgPermit>): OrgPermit => ({
  id: 'b1000000-0000-4000-8000-000000000001',
  number: 'ZW-2026-000123',
  status: 'ACTIVE',
  validFrom: '2026-10-06',
  validTo: '2026-10-06',
  pricePaidGrosze: 2500,
  permitType: { id: 'c1000000-0000-4000-8000-000000000001', name: 'Dzienne' },
  holder: { firstName: 'Jan', lastName: 'Kowalski' },
  createdAt: '2026-10-06T08:00:00.000Z',
  revokedAt: null,
  revokeReason: null,
  ...data,
});

const pageOf = (items: OrgPermit[], total = items.length, page = 1) => ({
  items,
  total,
  page,
  pageSize: 20,
});

const queries = (fetch: ReturnType<typeof mockApi>) =>
  fetch.mock.calls
    .map(([request]) => new URL(request.url))
    .filter((url) => url.pathname === `/api/v1/orgs/${ORG_ID}/permits`)
    .map((url) => Object.fromEntries(url.searchParams));

describe('permits sold by the organization', () => {
  it('lists the permits with holder, type, dates and price, and the reason of a revoked one', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/permits`]: () =>
        jsonResponse(
          pageOf([
            permit({}),
            permit({
              id: 'b1000000-0000-4000-8000-000000000002',
              number: 'ZW-2026-000100',
              status: 'REVOKED',
              holder: null,
              revokedAt: '2026-10-05T08:00:00.000Z',
              revokeReason: 'Zwrot przelewem',
            }),
          ]),
        ),
    });
    renderRoute(`/org/${ORG_ID}/permits`, { accessToken: 'access-1' });

    const active = await screen.findByRole('article', { name: 'ZW-2026-000123' });
    expect(within(active).getByText('Jan Kowalski')).toBeVisible();
    expect(within(active).getByText('Dzienne')).toBeVisible();
    expect(within(active).getByText(/25,00\s*zł/)).toBeVisible();
    expect(
      within(active).getByRole('button', { name: 'Unieważnij zezwolenie ZW-2026-000123' }),
    ).toBeVisible();
    const revoked = screen.getByRole('article', { name: 'ZW-2026-000100' });
    expect(within(revoked).getByText('Zwrot przelewem')).toBeVisible();
    expect(within(revoked).getByText('Konto usunięte')).toBeVisible();
    expect(within(revoked).queryByRole('button')).toBeNull();
    expect(screen.getByText('2 zezwolenia')).toBeVisible();
  });

  it('asks the API by status, number and page', async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/permits`]: (request) =>
        jsonResponse(
          pageOf([permit({})], 45, Number(new URL(request.url).searchParams.get('page') ?? 1)),
        ),
    });
    renderRoute(`/org/${ORG_ID}/permits`, { accessToken: 'access-1' });

    await user.click(await screen.findByRole('button', { name: 'Następna' }));
    expect(await screen.findByText('Strona 2 z 3')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Status'), 'Unieważnione');
    await user.type(screen.getByLabelText('Numer zezwolenia'), '000123');
    await user.click(screen.getByRole('button', { name: 'Szukaj po numerze' }));

    await waitFor(() =>
      expect(queries(fetch).at(-1)).toEqual({ status: 'REVOKED', q: '000123', page: '1' }),
    );
    expect(queries(fetch)).toContainEqual({ page: '2' });
  });

  it('revokes a permit with a required reason', async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/permits`]: () => jsonResponse(pageOf([permit({})])),
      [`POST /api/v1/orgs/${ORG_ID}/permits/b1000000-0000-4000-8000-000000000001/revoke`]: () =>
        jsonResponse(permit({ status: 'REVOKED' })),
    });
    renderRoute(`/org/${ORG_ID}/permits`, { accessToken: 'access-1' });

    await user.click(
      await screen.findByRole('button', { name: 'Unieważnij zezwolenie ZW-2026-000123' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Unieważnienie zezwolenia ZW-2026-000123' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Unieważnij zezwolenie' }));
    expect(await screen.findByText('Podaj powód (do 500 znaków).')).toBeVisible();

    await user.type(screen.getByLabelText('Powód unieważnienia'), 'Rezygnacja, zwrot przelewem');
    await user.click(screen.getByRole('button', { name: 'Unieważnij zezwolenie' }));

    await waitFor(async () =>
      expect(
        await sentBodies(
          fetch,
          `POST /api/v1/orgs/${ORG_ID}/permits/b1000000-0000-4000-8000-000000000001/revoke`,
        ),
      ).toEqual([{ reason: 'Rezygnacja, zwrot przelewem' }]),
    ); // Said and focused above the list: under a filter the row may leave it.
    const done = await screen.findByText('Zezwolenie ZW-2026-000123 unieważnione.');
    expect(done.closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('says that nothing matches a filter, and leaves a page past the end', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/permits`]: (request) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return jsonResponse(page > 1 ? pageOf([], 0, page) : pageOf([], 0));
      },
    });
    renderRoute(`/org/${ORG_ID}/permits?status=REVOKED&page=3`, { accessToken: 'access-1' });

    expect(await screen.findByText('Żadne zezwolenie nie pasuje do filtra.')).toBeVisible();
    expect(queries(fetch).at(-1)).toEqual({ status: 'REVOKED', page: '1' });
  });

  it('shows why a permit could not be revoked', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/permits`]: () => jsonResponse(pageOf([permit({})])),
      [`POST /api/v1/orgs/${ORG_ID}/permits/b1000000-0000-4000-8000-000000000001/revoke`]: () =>
        jsonResponse(
          { code: 'PERMIT_NOT_REVOCABLE', message: 'x', details: { status: 'EXPIRED' } },
          422,
        ),
    });
    renderRoute(`/org/${ORG_ID}/permits`, { accessToken: 'access-1' });

    await user.click(
      await screen.findByRole('button', { name: 'Unieważnij zezwolenie ZW-2026-000123' }),
    );
    await user.type(screen.getByLabelText('Powód unieważnienia'), 'Błąd');
    await user.click(screen.getByRole('button', { name: 'Unieważnij zezwolenie' }));

    expect(await screen.findByText('Tego zezwolenia nie można unieważnić.')).toBeVisible();
  });
});
