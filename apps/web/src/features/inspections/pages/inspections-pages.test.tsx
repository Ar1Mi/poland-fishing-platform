import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute, sentBodies } from '../../../test/render';
import type { Catch } from '../../catches/api/useCatches';
import type { Species } from '../../rules/api/useRules';
import type { Inspection, Verification } from '../api/useInspections';

const profile = {
  id: '6f1c2c9e-0000-4000-8000-000000000001',
  email: 'irena@example.test',
  firstName: 'Irena',
  lastName: 'Strażnik',
  birthDate: '1980-02-01',
  anglerCardNo: null,
  locale: 'pl',
  isSuperAdmin: false,
};
const session = {
  'GET /api/v1/me': () => jsonResponse(profile),
  'GET /api/v1/me/orgs': () => jsonResponse([]),
};

// Only the clock is fixed: 6 October 2026, 17:20 in Warsaw. Timers stay real for the UI.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const TOKEN = 'header.payload.signature';
const VERIFY = `GET /api/v1/verify/${TOKEN}`;
const ORG_ID = '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13';
const PERMIT_ID = '5e1c2c9e-0000-4000-8000-000000000101';
const LAKE = { id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e61', name: 'Zalew Zegrzyński' };
const PIKE: Species = {
  id: '0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e61',
  latinName: 'Esox lucius',
  namePl: 'Szczupak',
  nameEn: 'Pike',
  nameRu: 'Щука',
  isProtected: false,
};

const publicCheck: Verification = {
  valid: true,
  permit: {
    status: 'ACTIVE',
    validFrom: '2026-10-05',
    validTo: '2026-10-11',
    permitType: { name: 'Tygodniowe' },
    organization: { id: ORG_ID, name: 'Koło PZW 7' },
    waters: [LAKE],
    holderInitials: 'Ł. Ż.',
  },
  inspection: null,
};

const rejected: Catch = {
  id: '9a0b1c2d-0000-4000-8000-000000000001',
  clientId: '9a0b1c2d-0000-4000-8000-000000000011',
  permitId: PERMIT_ID,
  externalPermitId: null,
  water: LAKE,
  speciesId: PIKE.id,
  caughtAt: '2026-10-06T08:00:00.000Z',
  lengthCm: 40,
  weightG: 900,
  kept: true,
  lat: null,
  lng: null,
  status: 'REJECTED',
  violations: [{ code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } }],
  editableUntil: '2026-10-07T22:00:00.000Z',
  createdAt: '2026-10-06T08:00:05.000Z',
};

const inspectorCheck: Verification = {
  ...publicCheck,
  inspection: {
    permitId: PERMIT_ID,
    number: 'ZW-2026-000121',
    holder: { firstName: 'Łukasz', lastName: 'Żółć', birthYear: 1987 },
    catchesToday: [rejected],
  },
};

const saved: Inspection = {
  id: '7b8c9d0e-0000-4000-8000-000000000001',
  permit: {
    id: PERMIT_ID,
    number: 'ZW-2026-000121',
    permitType: { name: 'Tygodniowe' },
    holder: { firstName: 'Łukasz', lastName: 'Żółć' },
  },
  inspector: { id: profile.id, firstName: 'Irena', lastName: 'Strażnik' },
  performedAt: '2026-10-06T15:20:00.000Z',
  result: 'VIOLATION',
  notes: 'Szczupak poniżej wymiaru',
  lat: null,
  lng: null,
};

describe('verify page', () => {
  it('shows a guest the verdict and the public data, and offers an inspector to log in', async () => {
    const fetch = mockApi({ [VERIFY]: () => jsonResponse(publicCheck) });
    renderRoute(`/verify/${TOKEN}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zezwolenie ważne' }),
    ).toBeVisible();
    expect(screen.getByText('Tygodniowe')).toBeVisible();
    expect(screen.getByText('Koło PZW 7')).toBeVisible();
    expect(screen.getByText('Ł. Ż.')).toBeVisible();
    expect(screen.getByText('Zalew Zegrzyński')).toBeVisible();
    expect(screen.getByText('Aktywne')).toBeVisible();
    expect(screen.queryByText('Dane do kontroli')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zaloguj się jako strażnik' })).toHaveAttribute(
      'href',
      '/login',
    );
    const [request] = fetch.mock.calls.map(([sent]) => sent);
    expect(request!.headers.get('Authorization')).toBeNull();
  });

  it('says a forged or expired code is invalid', async () => {
    mockApi({ [VERIFY]: () => jsonResponse({ valid: false, permit: null, inspection: null }) });
    renderRoute(`/verify/${TOKEN}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zezwolenie nieważne' }),
    ).toBeVisible();
    expect(
      screen.getByText('Kod jest nieprawidłowy, podrobiony albo zezwolenie już wygasło.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Zaloguj się jako strażnik' }),
    ).not.toBeInTheDocument();
  });

  it('says why a genuine permit is invalid', async () => {
    mockApi({
      [VERIFY]: () =>
        jsonResponse({
          ...publicCheck,
          valid: false,
          permit: { ...publicCheck.permit!, status: 'REVOKED' },
        }),
    });
    renderRoute(`/verify/${TOKEN}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zezwolenie nieważne' }),
    ).toBeVisible();
    expect(screen.getByText('Zezwolenie zostało unieważnione przez organizację.')).toBeVisible();
  });

  it('tells a logged-in user of another organization that only its inspectors see more', async () => {
    mockApi({ ...session, [VERIFY]: () => jsonResponse(publicCheck) });
    renderRoute(`/verify/${TOKEN}`, { accessToken: 'access-1' });

    expect(
      await screen.findByText(/widzą tylko strażnicy i administratorzy organizacji/),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Zaloguj się jako strażnik' }),
    ).not.toBeInTheDocument();
  });

  it('shows an inspector the holder and today’s catches and saves the protocol', async () => {
    const fetch = mockApi({
      ...session,
      [VERIFY]: () => jsonResponse(inspectorCheck),
      'GET /api/v1/species': () => jsonResponse([PIKE]),
      [`POST /api/v1/orgs/${ORG_ID}/inspections`]: () => jsonResponse(saved, 201),
    });
    renderRoute(`/verify/${TOKEN}`, { accessToken: 'access-1' });

    expect(await screen.findByText('Łukasz Żółć')).toBeVisible();
    expect(screen.getByText('1987')).toBeVisible();
    expect(screen.getByText('ZW-2026-000121')).toBeVisible();
    const catches = screen.getByRole('region', { name: 'Połowy dzisiaj' });
    expect(await within(catches).findByText('Szczupak')).toBeVisible();
    expect(within(catches).getByText('Odrzucony')).toBeVisible();
    expect(within(catches).getByText('BR-02 · BELOW_MIN_LENGTH')).toBeVisible();
    expect(fetch.mock.calls[0]![0].headers.get('Authorization')).toBe('Bearer access-1');

    const form = screen.getByRole('form', { name: 'Protokół kontroli' });
    await userEvent.click(within(form).getByRole('button', { name: 'Zapisz protokół' }));
    expect(await within(form).findByText('Wybierz wynik kontroli.')).toBeVisible();

    await userEvent.click(within(form).getByRole('button', { name: 'Naruszenie' }));
    await userEvent.type(within(form).getByLabelText('Uwagi'), 'Szczupak poniżej wymiaru');
    await userEvent.click(within(form).getByRole('button', { name: 'Zapisz protokół' }));

    const confirmation = await screen.findByText('Protokół zapisany o 17:20');
    await waitFor(() => expect(confirmation).toHaveFocus());
    expect(screen.queryByRole('form', { name: 'Protokół kontroli' })).not.toBeInTheDocument();
    expect(await sentBodies(fetch, `POST /api/v1/orgs/${ORG_ID}/inspections`)).toEqual([
      {
        permitId: PERMIT_ID,
        result: 'VIOLATION',
        notes: 'Szczupak poniżej wymiaru',
        lat: null,
        lng: null,
      },
    ]);
  });

  it('says when no catch was recorded today', async () => {
    mockApi({
      ...session,
      [VERIFY]: () =>
        jsonResponse({
          ...inspectorCheck,
          inspection: { ...inspectorCheck.inspection!, catchesToday: [] },
        }),
      'GET /api/v1/species': () => jsonResponse([PIKE]),
    });
    renderRoute(`/verify/${TOKEN}`, { accessToken: 'access-1' });

    expect(await screen.findByText('Dziś nie zapisano połowów na tym zezwoleniu.')).toBeVisible();
  });
});

describe('organization inspections page', () => {
  const LIST = `GET /api/v1/orgs/${ORG_ID}/inspections`;

  it('lists the protocols of the season', async () => {
    mockApi({
      ...session,
      [LIST]: () =>
        jsonResponse([
          saved,
          {
            ...saved,
            id: '7b8c9d0e-0000-4000-8000-000000000002',
            result: 'OK',
            notes: null,
            performedAt: '2026-10-05T08:00:00.000Z',
            inspector: null,
          },
        ]),
    });
    renderRoute(`/org/${ORG_ID}/inspections`, { accessToken: 'access-1' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Protokoły kontroli' }),
    ).toBeVisible();
    const [violation, ok] = await screen.findAllByRole('article');
    expect(within(violation!).getByText('Naruszenie')).toBeVisible();
    expect(within(violation!).getByText('ZW-2026-000121')).toBeVisible();
    expect(within(violation!).getByText('Łukasz Żółć')).toBeVisible();
    expect(within(violation!).getByText('Irena Strażnik')).toBeVisible();
    expect(within(violation!).getByText('Szczupak poniżej wymiaru')).toBeVisible();
    expect(within(ok!).getByText('Bez zastrzeżeń')).toBeVisible();
    expect(within(ok!).getByText('Konto usunięte')).toBeVisible();
  });

  it('asks for an earlier season', async () => {
    const fetch = mockApi({ ...session, [LIST]: () => jsonResponse([]) });
    renderRoute(`/org/${ORG_ID}/inspections`, { accessToken: 'access-1' });

    expect(await screen.findByText('W tym sezonie nie zapisano protokołów.')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Sezon'), '2025');

    await waitFor(() =>
      expect(fetch.mock.calls.map(([sent]) => new URL(sent.url).search).filter(Boolean)).toEqual([
        '?season=2025',
      ]),
    );
  });

  it('shows the refusal of the API', async () => {
    mockApi({
      ...session,
      [LIST]: () => jsonResponse({ code: 'FORBIDDEN', message: 'Forbidden' }, 403),
    });
    renderRoute(`/org/${ORG_ID}/inspections`, { accessToken: 'access-1' });

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
