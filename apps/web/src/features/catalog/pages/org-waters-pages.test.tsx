import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { WaterDetail } from '../api/useWaters';

const ORG_ID = '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13';
const WATER_ID = '7b0c1d2e-0000-4000-8000-000000000001';
const PHOTO = 'c1d2e3f4-0000-4000-8000-000000000009';

const water: WaterDetail = {
  id: WATER_ID,
  name: 'Staw Głęboczek',
  type: 'POND',
  status: 'CONNECTED',
  region: 'mazowieckie',
  lat: 52.26,
  lng: 21.41,
  description: 'Stary opis',
  seasonInfo: null,
  photoVersion: null,
  organization: { id: ORG_ID, name: 'Koło PZW Ukleja', isActive: true },
  externalOwnerName: null,
  externalInfoUrl: null,
  source: 'MANUAL',
  importedAt: '2026-10-01T10:00:00.000Z',
};

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

describe('waters of the organization', () => {
  it('lists the connected waters, filtered by name from nine on', async () => {
    const user = userEvent.setup();
    const waters = Array.from({ length: 9 }, (_, index) => ({
      id: `7b0c1d2e-0000-4000-8000-00000000001${index}`,
      name: index === 0 ? 'Staw Głęboczek' : `Jezioro ${index}`,
      type: 'LAKE',
      region: 'mazowieckie',
    }));
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/waters`]: () => jsonResponse(waters),
    });
    renderRoute(`/org/${ORG_ID}/waters`, { accessToken: 'access-1' });

    await user.type(await screen.findByLabelText('Szukaj łowiska'), 'gleboczek');

    const list = screen.getByRole('list', { name: 'Łowiska organizacji' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Staw GłęboczekJezioro · mazowieckie']);
    expect(within(list).getByRole('link')).toHaveAttribute(
      'href',
      `/org/${ORG_ID}/waters/${waters[0]!.id}`,
    );
  });

  it('leads to a claim without waters', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/waters`]: () => jsonResponse([]),
    });
    renderRoute(`/org/${ORG_ID}/waters`, { accessToken: 'access-1' });

    expect(await screen.findByRole('link', { name: 'Złóż wniosek o łowisko' })).toHaveAttribute(
      'href',
      `/org/${ORG_ID}/claims`,
    );
  });
});

describe('water profile of the organization', () => {
  const show = (handlers: Record<string, (request: Request) => Response> = {}, card = water) => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/waters/${WATER_ID}`]: () => jsonResponse(card),
      ...handlers,
    });
    renderRoute(`/org/${ORG_ID}/waters/${WATER_ID}`, { accessToken: 'access-1' });
    return fetch;
  };

  it('saves the season and clears a blank description', async () => {
    const user = userEvent.setup();
    const fetch = show({
      [`PATCH /api/v1/orgs/${ORG_ID}/waters/${WATER_ID}`]: () =>
        jsonResponse({ ...water, description: null, seasonInfo: '1 V – 30 IX' }),
    });

    const description = await screen.findByLabelText('Opis łowiska');
    expect(description).toHaveValue('Stary opis');
    await user.clear(description);
    await user.type(screen.getByLabelText('Sezon'), '1 V – 30 IX');
    await user.click(screen.getByRole('button', { name: 'Zapisz opis i sezon' }));

    expect(await screen.findByText(/Karta łowiska pokazuje nowe dane/)).toBeVisible();
    expect(await sentBodies(fetch, `PATCH /api/v1/orgs/${ORG_ID}/waters/${WATER_ID}`)).toEqual([
      { description: null, seasonInfo: '1 V – 30 IX' },
    ]);
  });

  it('refuses a picture of another type before sending and uploads a photo', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const fetch = show({
      [`PUT /api/v1/orgs/${ORG_ID}/waters/${WATER_ID}/photo`]: () =>
        jsonResponse({ ...water, photoVersion: PHOTO }),
    });

    const field = await screen.findByLabelText('Dodaj zdjęcie');
    await user.upload(field, new File(['%PDF'], 'staw.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('Wybierz zdjęcie JPEG, PNG lub WebP.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Zapisz zdjęcie' })).toBeDisabled();

    await user.upload(field, new File(['png'], 'staw.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Zapisz zdjęcie' }));

    expect(
      await screen.findByRole('img', { name: 'Zdjęcie łowiska Staw Głęboczek' }),
    ).toHaveAttribute('src', `/api/v1/waters/${WATER_ID}/photo?v=${PHOTO}`);
    const upload = fetch.mock.calls.map(([sent]) => sent).find((sent) => sent.method === 'PUT');
    expect(upload?.headers.get('Content-Type')).toMatch(/^multipart\/form-data/);
  });

  it('removes the photo', async () => {
    const user = userEvent.setup();
    let card: WaterDetail = { ...water, photoVersion: PHOTO };
    show(
      {
        [`GET /api/v1/waters/${WATER_ID}`]: () => jsonResponse(card),
        [`DELETE /api/v1/orgs/${ORG_ID}/waters/${WATER_ID}/photo`]: () => {
          card = { ...card, photoVersion: null };
          return noContent();
        },
      },
      card,
    );

    await user.click(await screen.findByRole('button', { name: 'Usuń zdjęcie' }));

    await waitFor(() => expect(screen.getByText('Łowisko nie ma jeszcze zdjęcia.')).toBeVisible());
  });

  it('shows the refusal of the API for a water of another organization', async () => {
    const user = userEvent.setup();
    show({
      [`PATCH /api/v1/orgs/${ORG_ID}/waters/${WATER_ID}`]: () =>
        jsonResponse({ code: 'NOT_FOUND', message: 'Water not found' }, 404),
    });

    await user.type(await screen.findByLabelText('Sezon'), 'Cały rok');
    await user.click(screen.getByRole('button', { name: 'Zapisz opis i sezon' }));

    expect(await screen.findByText('Nie znaleziono.')).toBeVisible();
  });
});
