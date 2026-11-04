import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { ExternalPermit } from '../api/useExternalPermits';

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

const LAKE = {
  id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e61',
  name: 'Jezioro Wąsosze',
  type: 'LAKE',
  status: 'UNCLAIMED',
  region: 'kujawsko-pomorskie',
  lat: 53.1,
  lng: 17.9,
};
const POND = { ...LAKE, id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e62', name: 'Staw Dolny' };

const permit: ExternalPermit = {
  id: '7e1c2c9e-0000-4000-8000-000000000001',
  issuerName: 'Gospodarstwo Rybackie Wąsosze',
  number: '123/2026',
  status: 'ACTIVE',
  validFrom: '2026-05-01',
  validTo: '2026-12-31',
  waters: [{ id: LAKE.id, name: LAKE.name }],
  photoType: null,
  createdAt: '2026-05-01T10:00:00.000Z',
};

/** What a change sets off: the device is refreshed so the catch form offers the permit. */
const deviceRefresh = (permits: ExternalPermit[]) => ({
  'GET /api/v1/me/permits': () => jsonResponse([]),
  'GET /api/v1/me/external-permits': () => jsonResponse(permits),
  'GET /api/v1/species': () => jsonResponse([]),
  ...Object.fromEntries(
    permits.map((item) => [
      `GET /api/v1/me/external-permits/${item.id}/offline-bundle`,
      () => jsonResponse({ permit: item, waterRules: [] }),
    ]),
  ),
});

// Only the clock is fixed: 6 October 2026, 17:20 in Warsaw. Timers stay real for the UI.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:20:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('external permits page', () => {
  it('lists the permits with their waters and status, and offers to add one', async () => {
    mockApi({
      ...session,
      'GET /api/v1/me/external-permits': () =>
        jsonResponse([{ ...permit, photoType: 'image/jpeg' }]),
    });
    renderRoute('/me/external-permits', { accessToken: 'access-1' });

    const link = await screen.findByRole('link', { name: /Gospodarstwo Rybackie Wąsosze/ });
    expect(link).toHaveAttribute('href', `/me/external-permits/${permit.id}`);
    expect(link).toHaveTextContent('123/2026');
    expect(link).toHaveTextContent('Jezioro Wąsosze');
    expect(link).toHaveTextContent('Aktywne');
    expect(link).toHaveTextContent('Ze zdjęciem');
    expect(screen.getByRole('link', { name: 'Dodaj zezwolenie' })).toHaveAttribute(
      'href',
      '/me/external-permits/new',
    );
  });

  it('says when there are none yet', async () => {
    mockApi({ ...session, 'GET /api/v1/me/external-permits': () => jsonResponse([]) });
    renderRoute('/me/external-permits', { accessToken: 'access-1' });

    expect(await screen.findByText('Nie masz jeszcze zezwoleń zewnętrznych.')).toBeVisible();
  });

  it('is reached from my permits', async () => {
    mockApi({ ...session, 'GET /api/v1/me/permits': () => jsonResponse([]) });
    renderRoute('/me/permits', { accessToken: 'access-1' });

    expect(await screen.findByRole('link', { name: 'Zezwolenia zewnętrzne' })).toHaveAttribute(
      'href',
      '/me/external-permits',
    );
  });
});

describe('new external permit page', () => {
  const fillTerms = async () => {
    await userEvent.type(await screen.findByLabelText('Wydał'), 'Gospodarstwo Rybackie Wąsosze');
    await userEvent.type(screen.getByLabelText('Numer zezwolenia (opcjonalnie)'), '123/2026');
    fireEvent.change(screen.getByLabelText('Ważne od'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText('Ważne do (włącznie)'), {
      target: { value: '2026-12-31' },
    });
  };

  it('adds a permit for the water it came from, with its photo, and opens it', async () => {
    const fetch = mockApi({
      ...session,
      ...deviceRefresh([{ ...permit, photoType: 'image/png' }]),
      [`GET /api/v1/waters/${LAKE.id}`]: () => jsonResponse(LAKE),
      'POST /api/v1/me/external-permits': () => jsonResponse(permit, 201),
      [`PUT /api/v1/me/external-permits/${permit.id}/photo`]: () =>
        jsonResponse({ ...permit, photoType: 'image/png' }),
      [`GET /api/v1/me/external-permits/${permit.id}`]: () =>
        jsonResponse({ ...permit, photoType: 'image/png' }),
    });
    renderRoute(`/me/external-permits/new?waterId=${LAKE.id}`, { accessToken: 'access-1' });

    expect(
      await screen.findByRole('button', { name: 'Usuń łowisko Jezioro Wąsosze' }),
    ).toBeVisible();
    await fillTerms();
    await userEvent.upload(
      screen.getByLabelText('Zdjęcie lub skan zezwolenia (opcjonalnie)'),
      new File(['png'], 'zezwolenie.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zezwolenie' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gospodarstwo Rybackie Wąsosze' }),
    ).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/me/external-permits')).toEqual([
      {
        issuerName: 'Gospodarstwo Rybackie Wąsosze',
        number: '123/2026',
        validFrom: '2026-05-01',
        validTo: '2026-12-31',
        waterIds: [LAKE.id],
      },
    ]);
    const upload = fetch.mock.calls.map(([sent]) => sent).find((sent) => sent.method === 'PUT');
    expect(upload?.headers.get('Content-Type')).toMatch(/^multipart\/form-data/);
    expect(screen.getByText('Dodano zdjęcie zezwolenia.')).toBeVisible();
    // The device gets the new permit for the catch form.
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([sent]) =>
            new URL(sent.url).pathname ===
            `/api/v1/me/external-permits/${permit.id}/offline-bundle`,
        ),
      ).toBe(true),
    );
  });

  it('keeps the saved permit when the photo is refused, and says so', async () => {
    mockApi({
      ...session,
      ...deviceRefresh([permit]),
      'POST /api/v1/me/external-permits': () => jsonResponse(permit, 201),
      [`PUT /api/v1/me/external-permits/${permit.id}/photo`]: () =>
        jsonResponse({ code: 'VALIDATION_FAILED', message: 'Unsupported photo type' }, 400),
      [`GET /api/v1/me/external-permits/${permit.id}`]: () => jsonResponse(permit),
      'GET /api/v1/waters': () => jsonResponse({ items: [LAKE], truncated: false }),
    });
    renderRoute('/me/external-permits/new', { accessToken: 'access-1' });

    await fillTerms();
    await userEvent.type(screen.getByLabelText('Szukaj łowiska po nazwie'), 'Wąsosze');
    await userEvent.click(screen.getByRole('button', { name: 'Szukaj' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Dodaj: Jezioro Wąsosze · kujawsko-pomorskie' }),
    );
    await userEvent.upload(
      screen.getByLabelText('Zdjęcie lub skan zezwolenia (opcjonalnie)'),
      new File(['?'], 'zezwolenie.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zezwolenie' }));

    expect(
      await screen.findByText(
        'Zezwolenie zapisano, ale nie dodano zdjęcia. Spróbuj ponownie poniżej.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Nie dodano zdjęcia.')).toBeVisible();
  });

  it('finds waters by name, adds them and takes them away', async () => {
    mockApi({
      ...session,
      'GET /api/v1/waters': () => jsonResponse({ items: [LAKE, POND], truncated: false }),
    });
    renderRoute('/me/external-permits/new', { accessToken: 'access-1' });

    await userEvent.type(await screen.findByLabelText('Szukaj łowiska po nazwie'), 'a{Enter}');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Dodaj: Staw Dolny · kujawsko-pomorskie' }),
    );

    const chosen = screen.getByRole('list', { name: 'Wybrane łowiska' });
    expect(chosen).toHaveTextContent('Staw Dolny');
    // A chosen water is not offered again.
    expect(
      screen.queryByRole('button', { name: 'Dodaj: Staw Dolny · kujawsko-pomorskie' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Usuń łowisko Staw Dolny' }));
    expect(screen.queryByRole('list', { name: 'Wybrane łowiska' })).not.toBeInTheDocument();
  });

  it('checks the form before sending it', async () => {
    const fetch = mockApi(session);
    renderRoute('/me/external-permits/new', { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Zapisz zezwolenie' }));

    expect(await screen.findByText('Podaj, kto wydał zezwolenie.')).toBeVisible();
    expect(screen.getByText('Wybierz co najmniej jedno łowisko.')).toBeVisible();
    expect(screen.getAllByText('Podaj datę.')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Ważne od'), { target: { value: '2026-10-06' } });
    fireEvent.change(screen.getByLabelText('Ważne do (włącznie)'), {
      target: { value: '2026-10-05' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zezwolenie' }));
    expect(
      await screen.findByText('Data końca nie może być wcześniejsza niż data początku.'),
    ).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/me/external-permits')).toEqual([]);
  });
});

describe('external permit page', () => {
  let click: Mock<(this: HTMLAnchorElement) => void>;

  beforeEach(() => {
    click = vi.fn<(this: HTMLAnchorElement) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    // jsdom has no object URLs.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:file'), revokeObjectURL: vi.fn() });
  });

  const show = (extra = {}, shown: ExternalPermit = permit) => {
    const fetch = mockApi({
      ...session,
      [`GET /api/v1/me/external-permits/${shown.id}`]: () => jsonResponse(shown),
      ...extra,
    });
    renderRoute(`/me/external-permits/${shown.id}`, { accessToken: 'access-1' });
    return fetch;
  };

  it('shows the terms and leads to recording a catch while the permit is active', async () => {
    show();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gospodarstwo Rybackie Wąsosze' }),
    ).toBeVisible();
    expect(screen.getByText('123/2026')).toBeVisible();
    expect(screen.getByText('Jezioro Wąsosze')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Dodaj połów' })).toHaveAttribute('href', '/catch/new');
  });

  it('downloads the register of the season for the owner of the water', async () => {
    const fetch = show({
      [`GET /api/v1/me/external-permits/${permit.id}/register.pdf`]: () =>
        new Response('%PDF-1.3', { headers: { 'Content-Type': 'application/pdf' } }),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Pobierz rejestr 2026 (PDF)' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.contexts[0]?.download).toBe('rejestr-polowow-2026.pdf');
    const request = fetch.mock.calls
      .map(([sent]) => new URL(sent.url))
      .find((url) => url.pathname.endsWith('/register.pdf'));
    expect(request?.searchParams.get('season')).toBe('2026');
  });

  it('offers both seasons of a permit over New Year', async () => {
    show({}, { ...permit, validFrom: '2026-10-01', validTo: '2027-03-31' });

    const season = await screen.findByLabelText('Sezon');
    expect(season).toHaveValue('2026');
    await userEvent.selectOptions(season, '2027');
    expect(screen.getByRole('button', { name: 'Pobierz rejestr 2027 (PDF)' })).toBeVisible();
  });

  it('downloads the photo with the access token', async () => {
    show(
      {
        [`GET /api/v1/me/external-permits/${permit.id}/photo`]: () =>
          new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } }),
      },
      { ...permit, photoType: 'application/pdf' },
    );

    expect(await screen.findByText('Dodano skan zezwolenia (PDF).')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Pobierz' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.contexts[0]?.download).toBe('zezwolenie.pdf');
  });

  it('changes the terms and removes the number', async () => {
    const changed = { ...permit, number: null, validTo: '2026-10-31' };
    const fetch = show({
      ...deviceRefresh([changed]),
      [`PATCH /api/v1/me/external-permits/${permit.id}`]: () => jsonResponse(changed),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Popraw dane' }));
    await userEvent.clear(screen.getByLabelText('Numer zezwolenia (opcjonalnie)'));
    fireEvent.change(screen.getByLabelText('Ważne do (włącznie)'), {
      target: { value: '2026-10-31' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByText('Zmiany zapisane.')).toBeVisible();
    expect(screen.getByText('bez numeru')).toBeVisible();
    expect(await sentBodies(fetch, `PATCH /api/v1/me/external-permits/${permit.id}`)).toEqual([
      {
        issuerName: 'Gospodarstwo Rybackie Wąsosze',
        number: null,
        validFrom: '2026-05-01',
        validTo: '2026-10-31',
        waterIds: [LAKE.id],
      },
    ]);
  });

  it('explains why a permit with catches cannot be deleted', async () => {
    show({
      [`DELETE /api/v1/me/external-permits/${permit.id}`]: () =>
        jsonResponse({ code: 'EXTERNAL_PERMIT_IN_USE', message: 'In use' }, 409),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń zezwolenie' }));
    expect(screen.getByRole('button', { name: 'Nie usuwaj' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText(/Na tym zezwoleniu są zapisane połowy/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Usuń zezwolenie' })).toHaveFocus();
  });

  it('deletes a permit and goes back to the list', async () => {
    show({
      ...deviceRefresh([]),
      [`DELETE /api/v1/me/external-permits/${permit.id}`]: noContent,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń zezwolenie' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zezwolenia zewnętrzne' }),
    ).toBeVisible();
  });
});
