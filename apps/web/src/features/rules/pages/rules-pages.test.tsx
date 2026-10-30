import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { WaterDetail } from '../../catalog/api/useWaters';
import type { MyOrganization } from '../../orgs/api/useMyOrgs';
import type { OrgWater } from '../../permits/api/usePermitTypes';
import type { EffectiveRule, OrgRule, Species } from '../api/useRules';

const ORG_ID = '7a1c2c9e-0000-4000-8000-0000000000aa';
const RULES = `/api/v1/orgs/${ORG_ID}/rules`;

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
const pike: Species = {
  id: '5a000000-0000-4000-8000-000000000001',
  latinName: 'Esox lucius',
  namePl: 'Szczupak',
  nameEn: 'Northern pike',
  nameRu: 'Щука',
  isProtected: false,
};
const sturgeon: Species = {
  id: '5a000000-0000-4000-8000-000000000002',
  latinName: 'Acipenser oxyrinchus',
  namePl: 'Jesiotr ostronosy',
  nameEn: 'Atlantic sturgeon',
  nameRu: 'Атлантический осётр',
  isProtected: true,
};
const biale: OrgWater = {
  id: '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11',
  name: 'Jezioro Białe',
  type: 'LAKE',
  region: 'mazowieckie',
};
const orgRule: OrgRule = {
  id: 'a1000000-0000-4000-8000-000000000001',
  speciesId: pike.id,
  water: null,
  minLengthCm: 45,
  closedFrom: null,
  closedTo: null,
  dailyLimitCount: 2,
  dailyLimitWeightG: null,
  ineffective: ['minLengthCm'],
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const waterRule: OrgRule = {
  ...orgRule,
  id: 'a2000000-0000-4000-8000-000000000002',
  water: { id: biale.id, name: biale.name },
  minLengthCm: null,
  closedFrom: '12-01',
  closedTo: '02-28',
  dailyLimitCount: 0,
  ineffective: [],
};

const showPage = (rules: OrgRule[] = [orgRule, waterRule], handlers = {}) => {
  const fetch = mockApi({
    'GET /api/v1/me': () => jsonResponse(profile),
    'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
    [`GET ${RULES}`]: () => jsonResponse(rules),
    [`GET /api/v1/orgs/${ORG_ID}/waters`]: () => jsonResponse([biale]),
    'GET /api/v1/species': () => jsonResponse([sturgeon, pike]),
    ...handlers,
  });
  renderRoute(`/org/${ORG_ID}/rules`, { accessToken: 'access-1' });
  return fetch;
};

/** The entry of `region` whose heading line (a paragraph) reads `text`. */
const entry = async (region: string, text: string) => {
  const section = await screen.findByRole('region', { name: region });
  const item = (await within(section).findAllByRole('listitem')).find((element) =>
    within(element).queryByText(text, { selector: 'p' }),
  );
  if (!item) throw new Error(`No entry ${text} in ${region}`);
  return item;
};
const ruleEntry = (scope: string) => entry('Zasady organizacji i łowisk', scope);

describe('organization rules page', () => {
  it('sends a guest to the login page', async () => {
    mockApi({});

    renderRoute(`/org/${ORG_ID}/rules`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });

  it('lists the rules with their scope and marks a parameter a stricter level overrides', async () => {
    showPage();

    const whole = await ruleEntry('Wszystkie łowiska organizacji');
    const water = await ruleEntry('Jezioro Białe');
    expect(within(whole).getByText('Wszystkie łowiska organizacji')).toBeVisible();
    expect(within(whole).getByText('Wymiar ochronny: od 45 cm')).toBeVisible();
    expect(within(whole).getByText(/Nie obowiązuje: przepisy ogólne lub regulamin/)).toBeVisible();
    expect(within(whole).getByText('Limit dzienny: 2 sztuki')).toBeVisible();

    expect(within(water).getByText('Jezioro Białe')).toBeVisible();
    expect(within(water).getByText('Okres ochronny: 1 grudnia – 28 lutego')).toBeVisible();
    expect(within(water).getByText(/Nie wolno zabierać/)).toBeVisible();
    expect(within(water).queryByText(/Nie obowiązuje/)).toBeNull();
  });

  it('says when the organization has no rules of its own', async () => {
    showPage([]);

    expect(
      await screen.findByText('Organizacja nie ma własnych zasad — obowiązują przepisy ogólne.'),
    ).toBeVisible();
  });

  it('creates a rule of a water, an empty field meaning no restriction', async () => {
    const user = userEvent.setup();
    const fetch = showPage([], {
      [`POST ${RULES}`]: () => jsonResponse({ ...waterRule, ineffective: [] }, 201),
    });

    await user.click(await screen.findByRole('button', { name: 'Dodaj zasadę' }));
    await user.selectOptions(screen.getByLabelText('Gatunek'), 'Szczupak');
    await user.selectOptions(screen.getByLabelText('Dotyczy'), 'Jezioro Białe');
    await user.type(screen.getByLabelText('Wymiar ochronny (cm)'), '55');
    await user.type(screen.getByLabelText('Od'), '12-01');
    await user.type(screen.getByLabelText('Do'), '02-28');
    await user.type(screen.getByLabelText('Limit dzienny (sztuki)'), '0');
    await user.click(screen.getAllByRole('button', { name: 'Dodaj zasadę' }).at(-1)!);

    expect(await screen.findByText('Zasada została zapisana.')).toBeVisible();
    expect(await sentBodies(fetch, `POST ${RULES}`)).toEqual([
      {
        speciesId: pike.id,
        fishingWaterId: biale.id,
        minLengthCm: 55,
        closedFrom: '12-01',
        closedTo: '02-28',
        dailyLimitCount: 0,
        dailyLimitWeightG: null,
      },
    ]);
  });

  it('refuses a rule that restricts nothing and half a period, without a request', async () => {
    const user = userEvent.setup();
    const fetch = showPage([]);

    await user.click(await screen.findByRole('button', { name: 'Dodaj zasadę' }));
    await user.selectOptions(screen.getByLabelText('Gatunek'), 'Szczupak');
    await user.click(screen.getAllByRole('button', { name: 'Dodaj zasadę' }).at(-1)!);

    expect(
      await screen.findByText('Zasada musi coś ograniczać: wypełnij przynajmniej jedno pole.'),
    ).toBeVisible();

    await user.type(screen.getByLabelText('Od'), '02-30');
    await user.click(screen.getAllByRole('button', { name: 'Dodaj zasadę' }).at(-1)!);

    expect(await screen.findAllByText(/Podaj istniejący dzień w formacie MM-DD/)).toHaveLength(2);
    expect(await sentBodies(fetch, `POST ${RULES}`)).toEqual([]);
  });

  it('changes the parameters of a rule, a cleared field removing the limit', async () => {
    const user = userEvent.setup();
    const fetch = showPage([orgRule], {
      [`PATCH ${RULES}/${orgRule.id}`]: () => jsonResponse({ ...orgRule, minLengthCm: 60 }),
    });

    await user.click(await screen.findByRole('button', { name: 'Zmień zasadę: Szczupak' }));
    // Species and scope of a stored rule do not change.
    expect(screen.getByLabelText('Gatunek')).toBeDisabled();
    expect(screen.getByLabelText('Dotyczy')).toBeDisabled();
    await user.clear(screen.getByLabelText('Wymiar ochronny (cm)'));
    await user.type(screen.getByLabelText('Wymiar ochronny (cm)'), '60');
    await user.clear(screen.getByLabelText('Limit dzienny (sztuki)'));
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByText('Zasada została zapisana.')).toBeVisible();
    expect(await sentBodies(fetch, `PATCH ${RULES}/${orgRule.id}`)).toEqual([
      {
        minLengthCm: 60,
        closedFrom: null,
        closedTo: null,
        dailyLimitCount: null,
        dailyLimitWeightG: null,
      },
    ]);
  });

  it('deletes a rule after a second click', async () => {
    const user = userEvent.setup();
    const fetch = showPage([orgRule], { [`DELETE ${RULES}/${orgRule.id}`]: noContent });

    await user.click(await screen.findByRole('button', { name: 'Usuń zasadę: Szczupak' }));
    expect(screen.getByText('Usunąć zasadę dla gatunku Szczupak?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText('Zasada została usunięta.')).toBeVisible();
    expect(fetch.mock.calls.filter(([request]) => request.method === 'DELETE')).toHaveLength(1);
  });

  it('shows the error of the API', async () => {
    showPage([], {
      [`GET ${RULES}`]: () =>
        jsonResponse({ code: 'ORG_SCOPE_VIOLATION', message: 'ORG_SCOPE_VIOLATION' }, 403),
    });

    expect(await screen.findByText('Ta operacja dotyczy innej organizacji.')).toBeVisible();
  });
});

describe('rules on the water card', () => {
  const water: WaterDetail = {
    id: biale.id,
    name: 'Jezioro Białe',
    type: 'LAKE',
    region: 'mazowieckie',
    status: 'UNCLAIMED',
    lat: 52.2,
    lng: 21.0,
    description: null,
    organization: null,
    externalOwnerName: null,
    externalInfoUrl: null,
    source: 'RZGW',
    updatedAt: '2026-10-24T23:30:00.000Z',
  };
  const effective: EffectiveRule[] = [
    {
      speciesId: sturgeon.id,
      minLengthCm: null,
      dailyLimitCount: null,
      dailyLimitWeightG: null,
      closedPeriods: [{ from: '01-01', to: '12-31' }],
    },
    {
      speciesId: pike.id,
      minLengthCm: 50,
      dailyLimitCount: null,
      dailyLimitWeightG: 5000,
      closedPeriods: [
        { from: '01-01', to: '04-30' },
        { from: '12-01', to: '02-28' },
      ],
    },
  ];
  const show = (rules: EffectiveRule[]) => {
    mockApi({
      [`GET /api/v1/waters/${water.id}`]: () => jsonResponse(water),
      [`GET /api/v1/waters/${water.id}/rules`]: () => jsonResponse(rules),
      'GET /api/v1/species': () => jsonResponse([pike, sturgeon]),
    });
    renderRoute(`/waters/${water.id}`);
  };

  it('shows the effective rules per species, every closed period and protection', async () => {
    show(effective);

    const first = await entry('Zasady połowu', 'Jesiotr ostronosy');
    const second = await entry('Zasady połowu', 'Szczupak');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(first).getByText('Gatunek chroniony — tylko wypuścić')).toBeVisible();
    expect(within(second).getByText('Wymiar ochronny: od 50 cm')).toBeVisible();
    expect(within(second).getByText('Okres ochronny: 1 stycznia – 30 kwietnia')).toBeVisible();
    expect(within(second).getByText('Okres ochronny: 1 grudnia – 28 lutego')).toBeVisible();
    expect(within(second).getByText('Limit dzienny: łącznie 5 kg')).toBeVisible();
  });

  it('says when no species has a rule', async () => {
    show([]);

    expect(
      await screen.findByText('Brak szczególnych zasad dla gatunków na tym łowisku.'),
    ).toBeVisible();
  });
});
