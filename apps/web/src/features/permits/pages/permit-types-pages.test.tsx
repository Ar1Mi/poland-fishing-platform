import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { MyOrganization } from '../../orgs/api/useMyOrgs';
import type { OrgPermitType, OrgWater } from '../api/usePermitTypes';

const ORG_ID = '7a1c2c9e-0000-4000-8000-0000000000aa';
const TYPES = `/api/v1/orgs/${ORG_ID}/permit-types`;
const WATERS = `/api/v1/orgs/${ORG_ID}/waters`;

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
const myOrg: MyOrganization = {
  id: ORG_ID,
  name: 'Koło PZW nr 12',
  kind: 'PZW',
  status: 'ACTIVE',
  roles: ['ORG_ADMIN'],
};
const biale: OrgWater = {
  id: '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11',
  name: 'Jezioro Białe',
  type: 'LAKE',
  region: 'mazowieckie',
};
const czarne: OrgWater = {
  id: '1c9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a12',
  name: 'Jezioro Czarne',
  type: 'LAKE',
  region: 'lubelskie',
};
const daily: OrgPermitType = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Dzienne',
  durationDays: 1,
  priceGrosze: 2500,
  discountKind: 'NONE',
  isActive: true,
  inUse: true,
  waters: [{ id: biale.id, name: biale.name }],
  createdAt: '2026-10-01T10:00:00.000Z',
};
const weekly: OrgPermitType = {
  ...daily,
  id: 'a2000000-0000-4000-8000-000000000002',
  name: 'Tygodniowe junior',
  durationDays: 7,
  priceGrosze: 4050,
  discountKind: 'JUNIOR',
  isActive: false,
  inUse: false,
  waters: [
    { id: biale.id, name: biale.name },
    { id: czarne.id, name: czarne.name },
  ],
};

const apiError = (code: string, status: number) => jsonResponse({ code, message: code }, status);

/** The page of an active admin with `types` and the connected `waters`. */
const showPage = (
  types: OrgPermitType[] = [daily, weekly],
  waters: OrgWater[] = [biale, czarne],
  handlers: Parameters<typeof mockApi>[0] = {},
) => {
  const fetch = mockApi({
    'GET /api/v1/me': () => jsonResponse(profile),
    'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
    [`GET ${TYPES}`]: () => jsonResponse(types),
    [`GET ${WATERS}`]: () => jsonResponse(waters),
    ...handlers,
  });
  renderRoute(`/org/${ORG_ID}/permit-types`, { accessToken: 'access-1' });
  return fetch;
};

const listItem = async (name: string) => {
  const list = await screen.findByRole('region', { name: 'Rodzaje zezwoleń organizacji' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((element) => within(element).queryByText(name, { selector: 'p' }));
  if (!item) throw new Error(`No permit type ${name}`);
  return item;
};

describe('organization permit types page', () => {
  it('sends a guest to the login page', async () => {
    mockApi({});

    renderRoute(`/org/${ORG_ID}/permit-types`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });

  it('lists the types with their terms, price and state', async () => {
    showPage();

    const sold = await listItem('Dzienne');
    expect(within(sold).getByText('1 dzień')).toBeVisible();
    expect(within(sold).getByText('25,00 zł')).toBeVisible();
    expect(within(sold).getByText('W sprzedaży')).toBeVisible();
    expect(
      within(sold).getByText(/Sprzedane — ważność, ulga i łowiska są zablokowane/),
    ).toBeVisible();
    // A sold type can only stop selling.
    expect(within(sold).queryByRole('button', { name: 'Usuń' })).toBeNull();
    expect(within(sold).getByRole('button', { name: 'Wstrzymaj sprzedaż' })).toBeVisible();

    const stopped = await listItem('Tygodniowe junior');
    expect(within(stopped).getByText('7 dni · Ulgowe — młodzież')).toBeVisible();
    expect(within(stopped).getByText('40,50 zł')).toBeVisible();
    expect(within(stopped).getByText('Sprzedaż wstrzymana')).toBeVisible();
    expect(within(stopped).getByText('Łowiska (2)')).toBeVisible();
    expect(within(stopped).getByRole('button', { name: 'Wznów sprzedaż' })).toBeVisible();
    expect(within(stopped).getByRole('button', { name: 'Usuń' })).toBeVisible();
    expect(screen.getByText('Koło PZW nr 12')).toBeVisible();
  });

  it('creates a type from the typed price and the chosen waters', async () => {
    let types: OrgPermitType[] = [];
    const fetch = showPage([], [biale, czarne], {
      [`GET ${TYPES}`]: () => jsonResponse(types),
      [`POST ${TYPES}`]: () => {
        types = [
          { ...weekly, id: 'new', isActive: true, waters: [{ id: czarne.id, name: czarne.name }] },
        ];
        return jsonResponse(types[0], 201);
      },
    });
    expect(await screen.findByText('Organizacja nie ma jeszcze rodzajów zezwoleń.')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Dodaj rodzaj zezwolenia' }));
    await userEvent.type(screen.getByLabelText('Nazwa'), ' Tygodniowe junior ');
    await userEvent.clear(screen.getByLabelText('Ważność (dni)'));
    await userEvent.type(screen.getByLabelText('Ważność (dni)'), '7');
    await userEvent.type(screen.getByLabelText('Cena (zł)'), '40,50');
    await userEvent.selectOptions(screen.getByLabelText('Ulga'), 'Ulgowe — młodzież');
    await userEvent.click(screen.getByLabelText('Jezioro Czarne · lubelskie'));
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Zapisano rodzaj „Tygodniowe junior”.',
    );
    expect(await sentBodies(fetch, `POST ${TYPES}`)).toEqual([
      {
        name: 'Tygodniowe junior',
        durationDays: 7,
        priceGrosze: 4050,
        discountKind: 'JUNIOR',
        waterIds: [czarne.id],
      },
    ]);
    expect(await listItem('Tygodniowe junior')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Dodaj' })).toBeNull();
  });

  it('selects every water at once', async () => {
    const fetch = showPage([], [biale, czarne], {
      [`POST ${TYPES}`]: () => jsonResponse(daily, 201),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Dodaj rodzaj zezwolenia' }));

    await userEvent.click(screen.getByRole('button', { name: 'Zaznacz wszystkie' }));
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Dzienne');
    await userEvent.type(screen.getByLabelText('Cena (zł)'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));

    expect(await screen.findByRole('status')).toBeVisible();
    const [body] = (await sentBodies(fetch, `POST ${TYPES}`)) as { waterIds: string[] }[];
    expect(body?.waterIds).toEqual([biale.id, czarne.id]);
    expect(screen.queryByRole('button', { name: 'Odznacz wszystkie' })).toBeNull();
  });

  it('explains wrong fields and sends nothing', async () => {
    const fetch = showPage([], [biale, czarne]);
    await userEvent.click(await screen.findByRole('button', { name: 'Dodaj rodzaj zezwolenia' }));

    await userEvent.type(screen.getByLabelText('Cena (zł)'), '25,505');
    await userEvent.clear(screen.getByLabelText('Ważność (dni)'));
    await userEvent.type(screen.getByLabelText('Ważność (dni)'), '400');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));

    expect(await screen.findByText('Podaj nazwę (do 100 znaków).')).toBeVisible();
    expect(screen.getByLabelText('Cena (zł)')).toHaveAccessibleDescription(
      /Podaj cenę w złotych, np. 25,50/,
    );
    expect(screen.getByText('Podaj liczbę dni od 1 do 366.')).toBeVisible();
    expect(screen.getByText('Zaznacz co najmniej jedno łowisko.')).toBeVisible();
    expect(fetch.mock.calls.some(([request]) => request.method === 'POST')).toBe(false);
  });

  it('chooses the only water of the organization by default', async () => {
    const fetch = showPage([], [biale], {
      [`POST ${TYPES}`]: () => jsonResponse(daily, 201),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Dodaj rodzaj zezwolenia' }));

    expect(screen.getByLabelText('Jezioro Białe · mazowieckie')).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Zaznacz wszystkie' })).toBeNull();
    await userEvent.type(screen.getByLabelText('Nazwa'), 'Dzienne');
    await userEvent.type(screen.getByLabelText('Cena (zł)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj' }));

    expect(await screen.findByRole('status')).toBeVisible();
    expect(await sentBodies(fetch, `POST ${TYPES}`)).toEqual([
      expect.objectContaining({ priceGrosze: 0, waterIds: [biale.id] }),
    ]);
  });

  it('changes only the name and price of a sold type, showing its fixed terms', async () => {
    const fetch = showPage([daily], [biale, czarne], {
      [`PATCH ${TYPES}/${daily.id}`]: () => jsonResponse({ ...daily, priceGrosze: 2800 }),
    });
    await userEvent.click(
      within(await listItem('Dzienne')).getByRole('button', { name: 'Edytuj' }),
    );

    const form = screen.getByRole('region', { name: 'Edycja: Dzienne' });
    expect(within(form).getByText(/zostały już sprzedane/)).toBeVisible();
    expect(within(form).queryByLabelText('Ważność (dni)')).toBeNull();
    expect(within(form).queryByLabelText('Ulga')).toBeNull();
    expect(within(form).queryByRole('checkbox')).toBeNull();
    expect(within(form).getByLabelText('Cena (zł)')).toHaveValue('25,00');
    await userEvent.clear(within(form).getByLabelText('Cena (zł)'));
    await userEvent.type(within(form).getByLabelText('Cena (zł)'), '28');
    await userEvent.click(within(form).getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Zapisano rodzaj „Dzienne”.');
    expect(await sentBodies(fetch, `PATCH ${TYPES}/${daily.id}`)).toEqual([
      { name: 'Dzienne', priceGrosze: 2800 },
    ]);
  });

  it('sends every field of a type nobody has bought', async () => {
    const fetch = showPage([weekly], [biale, czarne], {
      [`PATCH ${TYPES}/${weekly.id}`]: () => jsonResponse(weekly),
    });
    await userEvent.click(
      within(await listItem('Tygodniowe junior')).getByRole('button', { name: 'Edytuj' }),
    );

    await userEvent.click(screen.getByLabelText('Jezioro Białe · mazowieckie'));
    await userEvent.selectOptions(screen.getByLabelText('Ulga'), 'Normalne');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByRole('status')).toBeVisible();
    expect(await sentBodies(fetch, `PATCH ${TYPES}/${weekly.id}`)).toEqual([
      {
        name: 'Tygodniowe junior',
        durationDays: 7,
        priceGrosze: 4050,
        discountKind: 'NONE',
        waterIds: [czarne.id],
      },
    ]);
  });

  it('stops and resumes the sale', async () => {
    const fetch = showPage([daily, weekly], [biale], {
      [`PATCH ${TYPES}/${daily.id}`]: () => jsonResponse({ ...daily, isActive: false }),
      [`PATCH ${TYPES}/${weekly.id}`]: () => jsonResponse({ ...weekly, isActive: true }),
    });

    await userEvent.click(
      within(await listItem('Dzienne')).getByRole('button', { name: 'Wstrzymaj sprzedaż' }),
    );
    await userEvent.click(
      within(await listItem('Tygodniowe junior')).getByRole('button', { name: 'Wznów sprzedaż' }),
    );

    await vi.waitFor(async () =>
      expect([
        ...(await sentBodies(fetch, `PATCH ${TYPES}/${daily.id}`)),
        ...(await sentBodies(fetch, `PATCH ${TYPES}/${weekly.id}`)),
      ]).toEqual([{ isActive: false }, { isActive: true }]),
    );
  });

  it('deletes a type only after a second click', async () => {
    let types = [weekly];
    const fetch = showPage(types, [biale], {
      [`GET ${TYPES}`]: () => jsonResponse(types),
      [`DELETE ${TYPES}/${weekly.id}`]: () => {
        types = [];
        return noContent();
      },
    });
    const item = await listItem('Tygodniowe junior');

    await userEvent.click(within(item).getByRole('button', { name: 'Usuń' }));
    const confirm = within(item).getByRole('group', {
      name: 'Usunąć rodzaj „Tygodniowe junior”? Tej operacji nie można cofnąć.',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Anuluj' }));
    expect(fetch.mock.calls.some(([request]) => request.method === 'DELETE')).toBe(false);
    await userEvent.click(within(item).getByRole('button', { name: 'Usuń' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Rodzaj „Tygodniowe junior” został usunięty.',
    );
    expect(await screen.findByText('Organizacja nie ma jeszcze rodzajów zezwoleń.')).toBeVisible();
  });

  it('shows why a type sold meanwhile cannot be deleted', async () => {
    showPage([weekly], [biale], {
      [`DELETE ${TYPES}/${weekly.id}`]: () => apiError('PERMIT_TYPE_IN_USE', 409),
    });
    const item = await listItem('Tygodniowe junior');

    await userEvent.click(within(item).getByRole('button', { name: 'Usuń' }));
    await userEvent.click(within(item).getByRole('button', { name: 'Tak, usuń' }));

    const alert = await within(item).findByRole('alert');
    expect(within(alert).getByText(/zostały już sprzedane/)).toBeVisible();
    expect(within(alert).getByText('PERMIT_TYPE_IN_USE')).toBeVisible();
  });

  it('points to the claims while the organization has no connected water', async () => {
    showPage([], []);

    expect(await screen.findByRole('link', { name: 'Złóż wniosek o łowisko' })).toHaveAttribute(
      'href',
      `/org/${ORG_ID}/claims`,
    );
    expect(screen.queryByRole('button', { name: 'Dodaj rodzaj zezwolenia' })).toBeNull();
  });

  it('shows the refusal of the API and no form', async () => {
    showPage([], [], {
      [`GET ${TYPES}`]: () => apiError('ORG_NOT_ACTIVE', 403),
      [`GET ${WATERS}`]: () => apiError('ORG_NOT_ACTIVE', 403),
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Organizacja nie jest aktywna.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Dodaj rodzaj zezwolenia' })).toBeNull();
  });
});
