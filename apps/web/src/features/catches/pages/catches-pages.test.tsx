import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreSession } from '../../../shared/auth/session';
import { enqueueCatch } from '../../../shared/offline/catch-queue';
import { type DeviceExternalPermit, type WaterRules, deviceDb } from '../../../shared/offline/db';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { MyPermit } from '../../permits/api/usePurchase';
import type { Species } from '../../rules/api/useRules';
import type { Catch } from '../api/useCatches';

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

// Only the clock is fixed: 6 October 2026, 17:20 in Warsaw. Timers stay real for the UI.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const LAKE = { id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e61', name: 'Zalew Zegrzyński' };
const RIVER = { id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e62', name: 'Narew' };

const permit: MyPermit = {
  id: '5e1c2c9e-0000-4000-8000-000000000101',
  number: 'ZW-2026-000121',
  status: 'ACTIVE',
  validFrom: '2026-10-01',
  validTo: '2026-10-31',
  pricePaidGrosze: 9000,
  permitType: {
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Miesięczne',
    durationDays: 31,
    discountKind: 'NONE',
  },
  organization: { id: '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13', name: 'Koło PZW 7' },
  waters: [RIVER, LAKE],
  createdAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
  revokeReason: null,
  qrToken: 'header.payload.signature',
};

const fish = (id: string, namePl: string): Species => ({
  id,
  latinName: `Latin ${namePl}`,
  namePl,
  nameEn: namePl,
  nameRu: namePl,
  isProtected: false,
});
const PIKE = fish('0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e61', 'Szczupak');
const BREAM = fish('0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e62', 'Leszcz');
const SALMON = fish('0b1d4c8e-6f2a-4d3b-9c5e-1a2b3c4d5e63', 'Łosoś');

/** Puts the angler's permits, the rules of their waters and species on the device, as a refresh. */
const onDevice = async ({
  permits = [permit],
  externalPermits = [],
  waterRules = [],
  species = [BREAM, PIKE, SALMON],
}: {
  permits?: MyPermit[];
  externalPermits?: DeviceExternalPermit[];
  waterRules?: WaterRules[];
  species?: Species[];
} = {}) => {
  await deviceDb.meta.put({
    key: 'owner',
    userId: profile.id,
    refreshedAt: new Date().toISOString(),
  });
  await deviceDb.permits.bulkPut(permits);
  await deviceDb.externalPermits.bulkPut(externalPermits);
  await deviceDb.rules.bulkPut(
    [...permits, ...externalPermits].map(({ id }) => ({ permitId: id, waterRules })),
  );
  await deviceDb.species.bulkPut(species);
};

/** A permit bought outside the platform (T-22) for a water of its own. */
const EXTERNAL: DeviceExternalPermit = {
  id: '7e1c2c9e-0000-4000-8000-000000000001',
  issuerName: 'Gospodarstwo Rybackie Wąsosze',
  number: null,
  status: 'ACTIVE',
  validFrom: '2026-05-01',
  validTo: '2026-12-31',
  waters: [{ id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e63', name: 'Jezioro Wąsosze' }],
  photoType: null,
  createdAt: '2026-05-01T10:00:00.000Z',
};

/** The rule of the pike on the river, as `GET /me/permits/:id/offline-bundle` gives it. */
const pikeOnRiver = (rule: Partial<WaterRules['rules'][number]>): WaterRules[] => [
  {
    waterId: RIVER.id,
    rules: [
      {
        speciesId: PIKE.id,
        minLengthCm: null,
        dailyLimitCount: null,
        dailyLimitWeightG: null,
        closedPeriods: [],
        ...rule,
      },
    ],
  },
];

const forForm = {
  ...session,
  // The register on the server: its catches count towards the daily limits too.
  'GET /api/v1/me/catches': () => jsonResponse([]),
};

/** What `POST /catches/sync` answers for the one catch sent. */
const verdict =
  (status: 'ACCEPTED' | 'REJECTED', violations: unknown[] = []) =>
  async (request: Request) => {
    const { items } = (await request.clone().json()) as { items: { clientId: string }[] };
    return jsonResponse({
      results: [
        {
          clientId: items[0]!.clientId,
          id: '9a000000-0000-4000-8000-000000000001',
          status,
          violations,
        },
      ],
    });
  };

const fillCatch = async ({ water = 'Narew', species = 'Szczupak', length = '62', weight = '' }) => {
  await userEvent.selectOptions(await screen.findByLabelText('Łowisko'), water);
  await userEvent.selectOptions(screen.getByLabelText('Gatunek'), species);
  await userEvent.click(screen.getByRole('button', { name: 'Zabrana' }));
  await userEvent.type(screen.getByLabelText('Długość (cm)'), length);
  if (weight) {
    await userEvent.type(screen.getByLabelText('Waga (kg)'), weight);
  }
  fireEvent.change(screen.getByLabelText('Czas połowu'), {
    target: { value: '2026-10-06T10:00' },
  });
};

const withoutNetwork = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

describe('new catch page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('presets the time of the catch to now in Warsaw', async () => {
    await onDevice();
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    expect(await screen.findByLabelText('Czas połowu')).toHaveValue('2026-10-06T17:20');
  });

  it('records a catch on the chosen water of the permit and shows it was accepted', async () => {
    await onDevice();
    const fetch = mockApi({ ...forForm, 'POST /api/v1/catches/sync': verdict('ACCEPTED') });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ weight: '1,25' });
    expect(screen.getByRole('button', { name: 'Zabrana' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByRole('heading', { name: 'Połów zapisany w rejestrze' }),
    ).toHaveFocus();
    const [body] = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: Record<string, unknown>[];
    }[];
    expect(body!.items).toEqual([
      {
        clientId: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        permitId: permit.id,
        externalPermitId: null,
        fishingWaterId: RIVER.id,
        speciesId: PIKE.id,
        // 10:00 in Warsaw (CEST).
        caughtAt: '2026-10-06T08:00:00.000Z',
        lengthCm: 62,
        weightG: 1250,
        kept: true,
        lat: null,
        lng: null,
      },
    ]);
    // Through the queue on the device, which keeps the verdict.
    expect(await deviceDb.catchQueue.toArray()).toEqual([
      expect.objectContaining({ userId: profile.id, status: 'ACCEPTED', item: body!.items[0] }),
    ]);
    expect(screen.getByRole('link', { name: 'Przejdź do rejestru' })).toHaveAttribute(
      'href',
      '/me/catches',
    );
  });

  it('records a catch on an external permit, checked on the device against its rules', async () => {
    const external = EXTERNAL;
    // The general rule of the pike on the lake, as the external permit's bundle gives it.
    await onDevice({
      permits: [],
      externalPermits: [external],
      waterRules: [
        {
          waterId: external.waters[0]!.id,
          rules: [
            {
              speciesId: PIKE.id,
              minLengthCm: 50,
              dailyLimitCount: null,
              dailyLimitWeightG: null,
              closedPeriods: [],
            },
          ],
        },
      ],
    });
    const fetch = mockApi({ ...forForm, 'POST /api/v1/catches/sync': verdict('ACCEPTED') });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ water: 'Jezioro Wąsosze', length: '45' });
    expect(await screen.findByText(/BR-02/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zapisz połów' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Długość (cm)'));
    await userEvent.type(screen.getByLabelText('Długość (cm)'), '55');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByRole('heading', { name: 'Połów zapisany w rejestrze' }),
    ).toBeVisible();
    const [body] = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: Record<string, unknown>[];
    }[];
    expect(body!.items[0]).toMatchObject({
      permitId: null,
      externalPermitId: external.id,
      fishingWaterId: external.waters[0]!.id,
    });
  });

  it('shows why the server rejected the catch and presets the water and species of the next one', async () => {
    // The device knows no rule of the pike: only the server finds the violations.
    await onDevice();
    mockApi({
      ...forForm,
      'POST /api/v1/catches/sync': verdict('REJECTED', [
        { code: 'BELOW_MIN_LENGTH', ruleId: 'BR-02', details: { minLengthCm: 50 } },
        { code: 'CLOSED_SEASON', ruleId: 'BR-03', details: { from: '01-01', to: '04-30' } },
        { code: 'DAILY_COUNT_LIMIT', ruleId: 'BR-04', details: { limit: 2, alreadyKept: 2 } },
        {
          code: 'DAILY_WEIGHT_LIMIT',
          ruleId: 'BR-05',
          details: { limitG: 5000, alreadyKeptG: 4200 },
        },
      ]),
    });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ length: '45' });
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    const heading = await screen.findByRole('heading', { name: 'Połów odrzucony' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('Zabrać można rybę od 50 cm — tę trzeba wypuścić.')).toBeVisible();
    expect(
      screen.getByText('Od 1 stycznia do 30 kwietnia tego gatunku nie wolno zabierać.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Tego dnia zabrano już 2 szt. przy limicie 2 szt. — liczą się ryby ze wszystkich łowisk.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Tego dnia zabrano już 4,2 kg przy limicie 5 kg — liczą się ryby ze wszystkich łowisk.',
      ),
    ).toBeVisible();
    expect(screen.getByText('BR-02 · BELOW_MIN_LENGTH')).toBeVisible();
    // The window of 6 October closes at midnight after 7 October.
    expect(heading.parentElement).toHaveTextContent('do 8 paź 2026, 00:00');

    await userEvent.click(screen.getByRole('button', { name: 'Dodaj kolejny połów' }));

    expect(await screen.findByLabelText('Łowisko')).toHaveDisplayValue('Narew');
    expect(screen.getByLabelText('Gatunek')).toHaveDisplayValue('Szczupak');
    expect(screen.getByLabelText('Długość (cm)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Zabrana' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows a violation while the catch is entered and does not let it be saved', async () => {
    await onDevice({ waterRules: pikeOnRiver({ minLengthCm: 50 }) });
    // No handler for the sync: a request would fail the test.
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ length: '45' });

    expect(
      await screen.findByText('Zabrać można rybę od 50 cm — tę trzeba wypuścić.'),
    ).toBeVisible();
    expect(screen.getByText('BR-02 · BELOW_MIN_LENGTH')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zapisz połów' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Wypuszczona' }));

    expect(await screen.findByText('Zgodne z zasadami łowiska')).toBeVisible();
    expect(screen.getByText('Wypuszczona ryba nie wlicza się do limitu.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zapisz połów' })).toBeEnabled();
  });

  it('counts the kept fish of the day on every water towards the daily limit', async () => {
    await onDevice({ waterRules: pikeOnRiver({ dailyLimitCount: 1 }) });
    mockApi({
      ...forForm,
      // A pike kept this morning on the lake, from another phone.
      'GET /api/v1/me/catches': () =>
        jsonResponse([
          caught({ speciesId: PIKE.id, status: 'ACCEPTED', violations: [], weightG: 2100 }),
        ]),
    });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({});

    expect(
      await screen.findByText(
        'Tego dnia zabrano już 1 szt. przy limicie 1 szt. — liczą się ryby ze wszystkich łowisk.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zapisz połów' })).toBeDisabled();
  });

  it('does not count a catch deleted in the register towards the daily limit', async () => {
    await onDevice({ waterRules: pikeOnRiver({ dailyLimitCount: 1 }) });
    // Accepted earlier on this phone, then deleted in the register (a wrong permit).
    await enqueueCatch(
      profile.id,
      { ...queuedPike, caughtAt: '2026-10-06T06:00:00.000Z' },
      new Date(),
    );
    await deviceDb.catchQueue.update(queuedPike.clientId, { status: 'ACCEPTED' });
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({});

    expect(await screen.findByText('Zgodne z zasadami łowiska')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zapisz połów' })).toBeEnabled();
  });

  it('records a catch without network and keeps it on the device', async () => {
    await onDevice();
    withoutNetwork();
    // No sync and no register: nothing may be sent.
    mockApi(session);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    expect(
      await screen.findByText('Połowy zapisują się na urządzeniu i wyślą się po powrocie sieci.'),
    ).toBeVisible();
    await fillCatch({});
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(await screen.findByRole('heading', { name: 'Zapisano na urządzeniu' })).toHaveFocus();
    expect(screen.getByText('Połów zostanie wysłany do rejestru, gdy wróci sieć.')).toBeVisible();
    expect(await deviceDb.catchQueue.toArray()).toEqual([
      expect.objectContaining({ userId: profile.id, status: 'PENDING_SYNC' }),
    ]);
  });

  it('works for the angler whose permits the device holds when the app opens without network', async () => {
    await onDevice();
    withoutNetwork();
    mockApi({
      'POST /api/v1/auth/refresh': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await restoreSession();
    renderRoute('/catch/new', { keepSession: true });

    expect(await screen.findByLabelText('Łowisko')).toBeVisible();
    expect(screen.getByText('Offline')).toBeVisible();
    await fillCatch({});
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(await screen.findByRole('heading', { name: 'Zapisano na urządzeniu' })).toBeVisible();
  });

  it('after no answer keeps the catch on the device and sends the same one again', async () => {
    let attempts = 0;
    await onDevice();
    const fetch = mockApi({
      ...forForm,
      'POST /api/v1/catches/sync': (request) =>
        ++attempts === 1
          ? jsonResponse({ code: 'INTERNAL_ERROR', message: 'Internal error' }, 500)
          : verdict('ACCEPTED')(request),
    });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({});
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));
    expect(await screen.findByText('INTERNAL_ERROR')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Zapisano na urządzeniu' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij teraz' }));

    expect(
      await screen.findByRole('heading', { name: 'Połów zapisany w rejestrze' }),
    ).toBeVisible();
    const bodies = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: { clientId: string }[];
    }[];
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it('marks a catch the server refused as input, and does not send it again', async () => {
    await onDevice();
    const fetch = mockApi({
      ...forForm,
      'POST /api/v1/catches/sync': () =>
        jsonResponse({ code: 'VALIDATION_FAILED', message: 'Request validation failed' }, 400),
    });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({});
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByRole('heading', { name: 'Nie udało się wysłać połowu' }),
    ).toBeVisible();
    expect(await deviceDb.catchQueue.toArray()).toEqual([
      expect.objectContaining({ status: 'FAILED', errorCode: 'VALIDATION_FAILED' }),
    ]);
    expect(await sentBodies(fetch, 'POST /api/v1/catches/sync')).toHaveLength(1);
  });

  it('does not promise a correction of a rejected catch whose window has closed', async () => {
    // A yearly permit: the device lets a catch of last October through, the server rejects it.
    await onDevice({ permits: [{ ...permit, validFrom: '2025-10-01', validTo: '2026-10-31' }] });
    mockApi({
      ...forForm,
      'POST /api/v1/catches/sync': verdict('REJECTED', [
        {
          code: 'PERMIT_NOT_ACTIVE',
          ruleId: 'BR-01',
          details: { status: 'REVOKED', validFrom: '2025-10-01', validTo: '2026-10-31' },
        },
      ]),
    });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({});
    fireEvent.change(screen.getByLabelText('Czas połowu'), {
      target: { value: '2025-10-02T10:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    const heading = await screen.findByRole('heading', { name: 'Połów odrzucony' });
    expect(heading.parentElement).toHaveTextContent('Czas na jego zmianę już minął.');
    expect(
      screen.getByText(
        'W chwili połowu zezwolenie nie było ważne (Unieważnione). Ważne od 1 paź 2025 do 31 paź 2026 włącznie.',
      ),
    ).toBeVisible();
  });

  it('offers the permit that ended yesterday for a catch of yesterday', async () => {
    await onDevice({
      permits: [
        {
          ...permit,
          status: 'EXPIRED',
          validFrom: '2026-10-05',
          validTo: '2026-10-05',
          waters: [RIVER],
          qrToken: null,
        },
      ],
    });
    const fetch = mockApi({ ...forForm, 'POST /api/v1/catches/sync': verdict('ACCEPTED') });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ water: 'Narew (ważne do 5 paź 2026)' });
    // Today it is not valid any more (BR-01 at the time of the catch).
    expect(
      await screen.findByText(
        'W chwili połowu zezwolenie nie było ważne (Wygasłe). Ważne od 5 paź 2026 do 5 paź 2026 włącznie.',
      ),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Czas połowu'), {
      target: { value: '2026-10-05T18:00' },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByRole('heading', { name: 'Połów zapisany w rejestrze' }),
    ).toBeVisible();
    const [body] = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: { caughtAt: string }[];
    }[];
    expect(body!.items[0]!.caughtAt).toBe('2026-10-05T16:00:00.000Z');
  });

  it('explains that a catch needs an active permit', async () => {
    await onDevice({
      permits: [{ ...permit, status: 'EXPIRED', validTo: '2026-09-30', qrToken: null }],
    });
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    expect(
      await screen.findByText(
        'Połów zapiszesz na aktywnym zezwoleniu. Teraz żadne z Twoich zezwoleń nie jest ważne.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Przejdź do zezwoleń' })).toHaveAttribute(
      'href',
      '/me/permits',
    );
    expect(screen.queryByLabelText('Łowisko')).not.toBeInTheDocument();
  });

  it('asks for the network when the device holds no permits of the angler', async () => {
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    expect(
      await screen.findByText(
        'Na tym urządzeniu nie ma jeszcze Twoich zezwoleń. Połącz się z siecią, aby je pobrać.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pobierz zezwolenia' })).toBeVisible();
    expect(screen.queryByLabelText('Łowisko')).not.toBeInTheDocument();
  });

  it('offers the species in the alphabetical order of the language', async () => {
    await onDevice();
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    const options = within(await screen.findByLabelText('Gatunek')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Wybierz gatunek',
      'Leszcz',
      'Łosoś',
      'Szczupak',
    ]);
  });

  it('asks for the species, kept or released and the length before sending', async () => {
    await onDevice();
    // No handler for the sync: a request would fail the test.
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Zapisz połów' }));

    expect(await screen.findByText('Wybierz gatunek.')).toBeVisible();
    expect(screen.getByText('Zaznacz, czy rybę zabrano, czy wypuszczono.')).toBeVisible();
    expect(screen.getByText('Podaj długość w pełnych centymetrach, od 1 do 400.')).toBeVisible();
    expect(screen.getByLabelText('Czas połowu')).not.toHaveValue('');
  });

  it('rejects a weight that is not kilograms', async () => {
    await onDevice();
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ weight: '1,2345' });
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByText('Podaj wagę w kilogramach, np. 1,25 — do 300 kg.'),
    ).toBeVisible();
  });

  it('sends a guest to the login page', async () => {
    mockApi({});
    renderRoute('/catch/new');

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });
});

const caught = (changes: Partial<Catch>): Catch => ({
  id: '9a000000-0000-4000-8000-000000000001',
  clientId: '8b000000-0000-4000-8000-000000000001',
  permitId: permit.id,
  externalPermitId: null,
  water: LAKE,
  speciesId: BREAM.id,
  caughtAt: '2026-10-06T08:00:00.000Z',
  lengthCm: 41,
  weightG: null,
  kept: true,
  lat: null,
  lng: null,
  status: 'REJECTED',
  violations: [{ code: 'WEIGHT_REQUIRED', ruleId: 'BR-11' }],
  // 6 October ends at 22:00 UTC; the window a day later.
  editableUntil: '2026-10-07T22:00:00.000Z',
  createdAt: '2026-10-06T08:01:00.000Z',
  ...changes,
});

const rejected = caught({});
const older = caught({
  id: '9a000000-0000-4000-8000-000000000002',
  speciesId: PIKE.id,
  water: RIVER,
  caughtAt: '2026-10-04T16:30:00.000Z',
  lengthCm: 64,
  weightG: 2350,
  status: 'ACCEPTED',
  violations: [],
  editableUntil: '2026-10-05T22:00:00.000Z',
});

const forRegister = (catches: () => Catch[]) => ({
  ...session,
  'GET /api/v1/me/catches': () => jsonResponse(catches()),
  'GET /api/v1/me/permits': () => jsonResponse([permit]),
  'GET /api/v1/me/external-permits': () => jsonResponse([]),
  'GET /api/v1/species': () => jsonResponse([PIKE, BREAM]),
});

/** A pike recorded on the river this morning, on the device. */
const queuedPike = {
  clientId: '8b000000-0000-4000-8000-000000000009',
  permitId: permit.id,
  externalPermitId: null,
  fishingWaterId: RIVER.id,
  speciesId: PIKE.id,
  caughtAt: '2026-10-06T08:00:00.000Z',
  lengthCm: 62,
  weightG: 2100,
  kept: true,
  lat: null,
  lng: null,
};

describe('my catches page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not offer to remove a catch sent without an answer', async () => {
    await onDevice();
    await enqueueCatch(profile.id, queuedPike, new Date());
    await deviceDb.catchQueue.update(queuedPike.clientId, { sentAt: '2026-10-06T15:00:00.000Z' });
    mockApi(forRegister(() => []));
    renderRoute('/me/catches', { accessToken: 'access-1' });

    const queue = await screen.findByRole('region', { name: 'Na tym urządzeniu' });
    expect(
      within(queue).getByText(/^Połów został wysłany, ale odpowiedź nie dotarła/),
    ).toBeVisible();
    expect(within(queue).queryByRole('button', { name: /^Usuń połów/ })).not.toBeInTheDocument();
  });

  it('shows the catches waiting on the device and sends them on request', async () => {
    await onDevice();
    await enqueueCatch(profile.id, queuedPike, new Date());
    const fetch = mockApi({
      ...forRegister(() => []),
      'POST /api/v1/catches/sync': verdict('ACCEPTED'),
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    const queue = await screen.findByRole('region', { name: 'Na tym urządzeniu' });
    expect(within(queue).getByText('1 połów czeka na wysłanie.')).toBeVisible();
    expect(within(queue).getByText('Szczupak')).toBeVisible();
    expect(within(queue).getByText('Narew')).toBeVisible();
    expect(within(queue).getByText('Do synchronizacji')).toBeVisible();
    await userEvent.click(within(queue).getByRole('button', { name: 'Synchronizuj' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Na tym urządzeniu' })).not.toBeInTheDocument(),
    );
    const [body] = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: unknown[];
    }[];
    expect(body!.items).toEqual([queuedPike]);
  });

  it('removes a refused catch from the device after a second confirmation', async () => {
    await onDevice();
    await enqueueCatch(profile.id, queuedPike, new Date());
    await deviceDb.catchQueue.update(queuedPike.clientId, {
      status: 'FAILED',
      errorCode: 'VALIDATION_FAILED',
    });
    mockApi(forRegister(() => []));
    renderRoute('/me/catches', { accessToken: 'access-1' });

    const queue = await screen.findByRole('region', { name: 'Na tym urządzeniu' });
    expect(within(queue).getByText('Nie wysłano')).toBeVisible();
    expect(within(queue).getByText(/^Serwer odrzucił połów:/)).toBeVisible();
    // A refused catch is not sent again.
    expect(within(queue).queryByRole('button', { name: 'Synchronizuj' })).not.toBeInTheDocument();
    await userEvent.click(within(queue).getByRole('button', { name: /^Usuń połów: Szczupak/ }));
    expect(
      within(queue).getByText('Usunąć ten połów z urządzenia? Nie trafi do rejestru.'),
    ).toBeVisible();
    await userEvent.click(within(queue).getByRole('button', { name: 'Tak, usuń' }));

    await waitFor(() => expect(screen.queryByText('Nie wysłano')).not.toBeInTheDocument());
    expect(await deviceDb.catchQueue.count()).toBe(0);
  });

  it('names the water of a catch waiting on an external permit', async () => {
    await onDevice({ externalPermits: [EXTERNAL] });
    await enqueueCatch(
      profile.id,
      {
        ...queuedPike,
        permitId: null,
        externalPermitId: EXTERNAL.id,
        fishingWaterId: EXTERNAL.waters[0]!.id,
      },
      new Date(),
    );
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockApi({
      ...session,
      'GET /api/v1/me/permits': () => jsonResponse([permit]),
      'GET /api/v1/me/external-permits': () => jsonResponse([]),
      'GET /api/v1/species': () => jsonResponse([PIKE, BREAM]),
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    const queue = await screen.findByRole('region', { name: 'Na tym urządzeniu' });
    expect(await within(queue).findByText(/Jezioro Wąsosze/)).toBeVisible();
  });

  it('shows only the catches on the device without network', async () => {
    await onDevice();
    await enqueueCatch(profile.id, queuedPike, new Date());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    // The register on the server is not asked for.
    mockApi({
      ...session,
      'GET /api/v1/me/permits': () => jsonResponse([permit]),
      'GET /api/v1/me/external-permits': () => jsonResponse([]),
      'GET /api/v1/species': () => jsonResponse([PIKE, BREAM]),
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    const queue = await screen.findByRole('region', { name: 'Na tym urządzeniu' });
    expect(
      within(queue).getByText('1 połów czeka na wysłanie — wyślemy go po powrocie sieci.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Bez sieci widać tylko połowy zapisane na tym urządzeniu. Pełny rejestr zobaczysz po połączeniu.',
      ),
    ).toBeVisible();
    // Logging out needs the server to forget the refresh cookie (ADR-0013).
    expect(screen.queryByRole('button', { name: 'Wyloguj się' })).not.toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeVisible();
  });

  it('lists the catches by day with their status and the reasons of a rejection', async () => {
    mockApi(forRegister(() => [rejected, older]));
    renderRoute('/me/catches', { accessToken: 'access-1' });

    const october6 = await screen.findByRole('region', { name: 'wtorek, 6 października' });
    expect(within(october6).getByText('Leszcz')).toBeVisible();
    expect(within(october6).getByText('Zabrana · 10:00')).toBeVisible();
    expect(within(october6).getByText('Zalew Zegrzyński')).toBeVisible();
    expect(within(october6).getByText('Odrzucony')).toBeVisible();
    expect(within(october6).getByText('Brak wagi')).toBeVisible();
    expect(within(october6).getByText('BR-11 · WEIGHT_REQUIRED')).toBeVisible();
    expect(
      within(october6).getByRole('button', { name: 'Popraw połów: Leszcz, 10:00' }),
    ).toBeVisible();

    const october4 = screen.getByRole('region', { name: 'niedziela, 4 października' });
    expect(within(october4).getByText('Przyjęty')).toBeVisible();
    expect(within(october4).getByText('64 cm')).toBeVisible();
    expect(within(october4).getByText('2,35 kg')).toBeVisible();
    // Its window has closed.
    expect(within(october4).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Dodaj połów' })).toHaveAttribute('href', '/catch/new');
  });

  it('corrects a catch in place and sends only what the form changes', async () => {
    let list = [rejected];
    const fetch = mockApi({
      ...forRegister(() => list),
      [`PATCH /api/v1/catches/${rejected.id}`]: () => {
        list = [{ ...rejected, weightG: 1200, status: 'ACCEPTED', violations: [] }];
        return jsonResponse(list[0]);
      },
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Popraw połów: Leszcz, 10:00' }),
    );
    expect(screen.getByLabelText('Długość (cm)')).toHaveValue('41');
    expect(screen.getByRole('button', { name: 'Zabrana' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(screen.getByLabelText('Waga (kg)'), '1,2');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByText('Przyjęty')).toBeVisible();
    expect(await sentBodies(fetch, `PATCH /api/v1/catches/${rejected.id}`)).toEqual([
      {
        speciesId: BREAM.id,
        fishingWaterId: LAKE.id,
        lengthCm: 41,
        weightG: 1200,
        kept: true,
      },
    ]);
  });

  it('deletes a catch after a second confirmation', async () => {
    let list = [rejected];
    const fetch = mockApi({
      ...forRegister(() => list),
      [`DELETE /api/v1/catches/${rejected.id}`]: () => {
        list = [];
        return noContent();
      },
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń połów: Leszcz, 10:00' }));
    const confirm = screen.getByRole('group', { name: 'Usunąć ten połów z rejestru?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText('Połów został usunięty z rejestru.')).toBeVisible();
    expect(await screen.findByText('W tym sezonie nie zapisano jeszcze połowów.')).toBeVisible();
    expect(fetch.mock.calls.some(([request]) => request.method === 'DELETE')).toBe(true);
    // The row with the focused button is gone: the notice takes the focus.
    expect(
      screen.getByText('Połów został usunięty z rejestru.').closest('[tabindex]'),
    ).toHaveFocus();
  });

  it('forgets a deleted catch on the device, so it no longer counts towards a limit', async () => {
    let list = [rejected];
    await enqueueCatch(
      profile.id,
      { ...queuedPike, clientId: rejected.clientId, speciesId: BREAM.id },
      new Date(),
    );
    await deviceDb.catchQueue.update(rejected.clientId, { status: 'ACCEPTED' });
    mockApi({
      ...forRegister(() => list),
      [`DELETE /api/v1/catches/${rejected.id}`]: () => {
        list = [];
        return noContent();
      },
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń połów: Leszcz, 10:00' }));
    const confirm = screen.getByRole('group', { name: 'Usunąć ten połów z rejestru?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText('Połów został usunięty z rejestru.')).toBeVisible();
    await waitFor(async () =>
      expect(await deviceDb.catchQueue.get(rejected.clientId)).toBeUndefined(),
    );
  });

  it('keeps the focus within the row while correcting or deleting', async () => {
    mockApi(forRegister(() => [rejected]));
    renderRoute('/me/catches', { accessToken: 'access-1' });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Popraw połów: Leszcz, 10:00' }),
    );
    expect(screen.getByRole('heading', { name: 'Popraw połów' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.getByRole('button', { name: 'Popraw połów: Leszcz, 10:00' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Usuń połów: Leszcz, 10:00' }));
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.getByRole('button', { name: 'Usuń połów: Leszcz, 10:00' })).toHaveFocus();
  });

  it('keeps the reason of a refused deletion when the row closes', async () => {
    let list = [rejected];
    mockApi({
      ...forRegister(() => list),
      [`DELETE /api/v1/catches/${rejected.id}`]: () => {
        list = [{ ...rejected, editableUntil: '2026-10-06T15:00:00.000Z' }];
        return jsonResponse(
          {
            code: 'EDIT_WINDOW_CLOSED',
            message: 'Closed',
            details: { editableUntil: list[0]!.editableUntil },
          },
          422,
        );
      },
    });
    renderRoute('/me/catches', { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń połów: Leszcz, 10:00' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText('Czas na zmianę tego wpisu minął.')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Usuń połów/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Czas na zmianę tego wpisu minął.')).toBeVisible();
  });

  it('asks for an earlier season and keeps it in the address', async () => {
    const fetch = mockApi(forRegister(() => []));
    renderRoute('/me/catches', { accessToken: 'access-1' });
    await userEvent.selectOptions(await screen.findByLabelText('Sezon'), '2025');

    await waitFor(() =>
      expect(fetch.mock.calls.map(([request]) => new URL(request.url).search)).toContain(
        '?season=2025',
      ),
    );
    expect(
      within(screen.getByLabelText('Sezon'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['2026', '2025', '2024', '2023', '2022']);
  });
});

describe('without network', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const openOffline = async (path: string) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockApi({
      'POST /api/v1/auth/refresh': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await restoreSession();
    renderRoute(path, { keepSession: true });
  };

  it('shows the permits and the QR code kept on the device', async () => {
    await onDevice();
    await openOffline(`/me/permits/${permit.id}`);

    expect(
      await screen.findByText(
        'Brak sieci — zezwolenia zapisane na tym urządzeniu, w stanie z ostatniego połączenia.',
      ),
    ).toBeVisible();
    expect(screen.getByTitle('Kod QR zezwolenia ZW-2026-000121')).toBeInTheDocument();
    // The PDF needs the server.
    expect(screen.queryByRole('button', { name: 'Pobierz PDF' })).not.toBeInTheDocument();
  });

  it('lists the permits kept on the device', async () => {
    await onDevice();
    await openOffline('/me/permits');

    expect(await screen.findByText('Miesięczne')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Dodaj połów' })).toHaveAttribute('href', '/catch/new');
  });

  it('keeps the pages that need the server closed', async () => {
    await onDevice();
    await openOffline('/org');

    expect(await screen.findByText('Brak połączenia z siecią')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Dodaj połów' })).toHaveAttribute('href', '/catch/new');
  });
});

describe('links to the register', () => {
  it('lead from my permits to recording a catch and to the register', async () => {
    mockApi({ ...session, 'GET /api/v1/me/permits': () => jsonResponse([permit]) });
    renderRoute('/me/permits', { accessToken: 'access-1' });

    expect(await screen.findByRole('link', { name: 'Dodaj połów' })).toHaveAttribute(
      'href',
      '/catch/new',
    );
    expect(screen.getByRole('link', { name: 'Rejestr połowów' })).toHaveAttribute(
      'href',
      '/me/catches',
    );
  });

  it('offer only the register without an active permit', async () => {
    mockApi({
      ...session,
      'GET /api/v1/me/permits': () => jsonResponse([{ ...permit, status: 'EXPIRED' }]),
    });
    renderRoute('/me/permits', { accessToken: 'access-1' });

    expect(await screen.findByRole('link', { name: 'Rejestr połowów' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Dodaj połów' })).not.toBeInTheDocument();
  });
});
