import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const forForm = {
  ...session,
  'GET /api/v1/me/permits': () => jsonResponse([permit]),
  // In database collation, as the API sends them.
  'GET /api/v1/species': () => jsonResponse([BREAM, PIKE, SALMON]),
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

describe('new catch page', () => {
  it('presets the time of the catch to now in Warsaw', async () => {
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    expect(await screen.findByLabelText('Czas połowu')).toHaveValue('2026-10-06T17:20');
  });

  it('records a catch on the chosen water of the permit and shows it was accepted', async () => {
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
    expect(screen.getByRole('link', { name: 'Przejdź do rejestru' })).toHaveAttribute(
      'href',
      '/me/catches',
    );
  });

  it('shows why the catch was rejected and presets the water and species of the next one', async () => {
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

  it('offers the species in the alphabetical order of the language', async () => {
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
    mockApi(forForm);
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({ weight: '1,2345' });
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByText('Podaj wagę w kilogramach, np. 1,25 — do 300 kg.'),
    ).toBeVisible();
  });

  it('after no answer sends only the same catch again, with the same clientId', async () => {
    let attempts = 0;
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
    // It may be stored already: what was sent cannot be changed before it is sent again.
    expect(screen.getByLabelText('Długość (cm)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Zapisz połów' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij ponownie' }));

    expect(
      await screen.findByRole('heading', { name: 'Połów zapisany w rejestrze' }),
    ).toBeVisible();
    const bodies = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: { clientId: string }[];
    }[];
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it('keeps the form open to corrections when the server refused the catch', async () => {
    let attempts = 0;
    const fetch = mockApi({
      ...forForm,
      'POST /api/v1/catches/sync': (request) =>
        ++attempts === 1
          ? jsonResponse({ code: 'VALIDATION_FAILED', message: 'Request validation failed' }, 400)
          : verdict('ACCEPTED')(request),
    });
    renderRoute('/catch/new', { accessToken: 'access-1' });

    await fillCatch({});
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));
    expect(await screen.findByText('VALIDATION_FAILED')).toBeVisible();
    await userEvent.clear(screen.getByLabelText('Długość (cm)'));
    await userEvent.type(screen.getByLabelText('Długość (cm)'), '63');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz połów' }));

    expect(
      await screen.findByRole('heading', { name: 'Połów zapisany w rejestrze' }),
    ).toBeVisible();
    const bodies = (await sentBodies(fetch, 'POST /api/v1/catches/sync')) as {
      items: { clientId: string; lengthCm: number }[];
    }[];
    expect(bodies.map(({ items }) => items[0]!.lengthCm)).toEqual([62, 63]);
  });

  it('does not promise a correction of a rejected catch whose window has closed', async () => {
    mockApi({
      ...forForm,
      'POST /api/v1/catches/sync': verdict('REJECTED', [
        {
          code: 'PERMIT_NOT_ACTIVE',
          ruleId: 'BR-01',
          details: { status: 'SCHEDULED', validFrom: '2026-10-01', validTo: '2026-10-31' },
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
        'W chwili połowu zezwolenie nie było ważne (Zaplanowane). Ważne od 1 paź 2026 do 31 paź 2026 włącznie.',
      ),
    ).toBeVisible();
  });

  it('explains that a catch needs an active permit', async () => {
    mockApi({
      ...forForm,
      'GET /api/v1/me/permits': () => jsonResponse([{ ...permit, status: 'EXPIRED' }]),
    });
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
  'GET /api/v1/species': () => jsonResponse([PIKE, BREAM]),
});

describe('my catches page', () => {
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
