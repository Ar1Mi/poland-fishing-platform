import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { jsonResponse, mockApi, renderRoute, sentBodies } from '../../../test/render';
import type { WaterSummary } from '../../catalog/api/useWaters';
import type { MyOrganization } from '../../orgs/api/useMyOrgs';
import type { AdminClaim, Claim } from '../api/useClaims';

const ORG_ID = '7a1c2c9e-0000-4000-8000-0000000000aa';
const WATER_ID = '0b8f6c1e-1c1e-4f43-9a51-0d6c2f0d9a11';

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
const zegrze: WaterSummary = {
  id: WATER_ID,
  name: 'Zalew Zegrzyński',
  type: 'RESERVOIR',
  status: 'UNCLAIMED',
  region: 'mazowieckie',
  lat: 52.46,
  lng: 21.04,
};
const zegrzeDetail = {
  ...zegrze,
  description: null,
  organization: null,
  externalOwnerName: 'RZGW Warszawa',
  externalInfoUrl: null,
  source: 'RZGW',
  updatedAt: '2026-10-01T10:00:00.000Z',
};
const rejected: Claim = {
  id: 'c1000000-0000-4000-8000-000000000001',
  status: 'REJECTED',
  water: {
    id: '1c9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a12',
    name: 'Jezioro Białe',
    region: 'mazowieckie',
    status: 'UNCLAIMED',
  },
  comment: 'Brak umowy dzierżawy',
  createdAt: '2026-10-01T10:00:00.000Z',
  reviewedAt: '2026-10-03T10:00:00.000Z',
};
/** Rejected without a comment because another organization's claim of the water was approved. */
const lost: Claim = {
  id: 'c3000000-0000-4000-8000-000000000003',
  status: 'REJECTED',
  water: { id: WATER_ID, name: 'Zalew Zegrzyński', region: 'mazowieckie', status: 'CONNECTED' },
  comment: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  reviewedAt: '2026-10-03T10:00:00.000Z',
};
const pendingAdminClaim: AdminClaim = {
  id: 'c2000000-0000-4000-8000-000000000002',
  status: 'PENDING',
  water: { id: WATER_ID, name: 'Zalew Zegrzyński', region: 'mazowieckie', status: 'UNCLAIMED' },
  comment: null,
  createdAt: '2026-10-04T10:00:00.000Z',
  reviewedAt: null,
  organization: { id: ORG_ID, name: 'Koło PZW nr 12', nip: '5260250274', status: 'ACTIVE' },
  documentType: 'application/pdf',
};

const apiError = (code: string, status: number) => jsonResponse({ code, message: code }, status);
const pdf = () => new File(['%PDF-1.4'], 'umowa.pdf', { type: 'application/pdf' });
const ORG_CLAIMS = `/api/v1/orgs/${ORG_ID}/claims`;

const sentText = (fetch: ReturnType<typeof mockApi>, key: string) =>
  Promise.all(
    fetch.mock.calls
      .map(([request]) => request)
      .filter((request) => `${request.method} ${new URL(request.url).pathname}` === key)
      .map((request) => request.clone().text()),
  );

describe('organization claims page', () => {
  it('sends a guest to the login page', async () => {
    mockApi({});

    renderRoute(`/org/${ORG_ID}/claims`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
  });

  it('lists the claims with their status and why they were rejected', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
      [`GET ${ORG_CLAIMS}`]: () => jsonResponse([rejected, lost]),
    });

    renderRoute(`/org/${ORG_ID}/claims`, { accessToken: 'access-1' });

    const list = await screen.findByRole('region', { name: 'Złożone wnioski' });
    const [withComment, lostItem] = within(list).getAllByRole('listitem');
    expect(within(withComment!).getByRole('link', { name: 'Jezioro Białe' })).toHaveAttribute(
      'href',
      `/waters/${rejected.water.id}`,
    );
    expect(within(withComment!).getByText('Odrzucony')).toBeVisible();
    expect(
      within(withComment!).getByText('Komentarz administratora: Brak umowy dzierżawy'),
    ).toBeVisible();
    // No comment on a claim closed by the approval of another one: the page says why.
    expect(within(lostItem!).getByText('Odrzucony')).toBeVisible();
    expect(
      within(lostItem!).getByText('Łowisko zostało podłączone na podstawie innego wniosku.'),
    ).toBeVisible();
    expect(await screen.findByText('Koło PZW nr 12')).toBeVisible();
  });

  it('claims the water it came with from the card, as multipart with the document', async () => {
    let claims: Claim[] = [];
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
      [`GET /api/v1/waters/${WATER_ID}`]: () => jsonResponse(zegrzeDetail),
      [`GET ${ORG_CLAIMS}`]: () => jsonResponse(claims),
      [`POST ${ORG_CLAIMS}`]: () => {
        claims = [
          {
            ...rejected,
            id: 'new',
            status: 'PENDING',
            water: {
              id: zegrze.id,
              name: zegrze.name,
              region: zegrze.region,
              status: zegrze.status,
            },
            comment: null,
            reviewedAt: null,
          },
        ];
        return jsonResponse(claims[0], 201);
      },
    });
    renderRoute(`/org/${ORG_ID}/claims?waterId=${WATER_ID}`, { accessToken: 'access-1' });

    expect(await screen.findByText('Zalew Zegrzyński · mazowieckie')).toBeVisible();
    await userEvent.upload(screen.getByLabelText('Dokument'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij wniosek' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Wniosek o łowisko Zalew Zegrzyński został wysłany.',
    );
    const [body] = await sentText(fetch, `POST ${ORG_CLAIMS}`);
    expect(body).toContain(`name="fishingWaterId"\r\n\r\n${WATER_ID}`);
    // undici does not read a jsdom File: the part arrives empty here (checked in a browser).
    expect(body).toMatch(/name="file".*\r\nContent-Type: application\/pdf/);
    const list = screen.getByRole('region', { name: 'Złożone wnioski' });
    expect(await within(list).findByText('Oczekuje na decyzję')).toBeVisible();
  });

  it('finds an unclaimed water by name and picks it', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
      [`GET ${ORG_CLAIMS}`]: () => jsonResponse([]),
      'GET /api/v1/waters': () => jsonResponse({ items: [zegrze], truncated: false }),
    });
    renderRoute(`/org/${ORG_ID}/claims`, { accessToken: 'access-1' });

    expect(
      await screen.findByText('Organizacja nie złożyła jeszcze żadnego wniosku.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wyślij wniosek' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nazwa łowiska'), 'zegrz');
    await userEvent.click(screen.getByRole('button', { name: 'Szukaj' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Zalew Zegrzyński · mazowieckie' }),
    );

    expect(screen.getByRole('button', { name: 'Zmień łowisko' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wyślij wniosek' })).toBeEnabled();
    const searched = fetch.mock.calls
      .map(([request]) => new URL(request.url))
      .filter((url) => url.pathname === '/api/v1/waters')
      .map((url) => Object.fromEntries(url.searchParams));
    expect(searched).toEqual([{ q: 'zegrz', status: 'UNCLAIMED' }]);
  });

  it('checks the document before uploading', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
      [`GET /api/v1/waters/${WATER_ID}`]: () => jsonResponse(zegrzeDetail),
      [`GET ${ORG_CLAIMS}`]: () => jsonResponse([]),
    });
    renderRoute(`/org/${ORG_ID}/claims?waterId=${WATER_ID}`, { accessToken: 'access-1' });
    await screen.findByText('Zalew Zegrzyński · mazowieckie');
    const submit = screen.getByRole('button', { name: 'Wyślij wniosek' });

    await userEvent.click(submit);
    expect(await screen.findByText('Dołącz dokument.')).toBeVisible();

    const big = new File(['x'], 'skan.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    await userEvent.upload(screen.getByLabelText('Dokument'), big);
    await userEvent.click(submit);
    expect(await screen.findByText('Plik jest większy niż 5 MB.')).toBeVisible();

    await userEvent.upload(
      screen.getByLabelText('Dokument'),
      new File(['GIF89a'], 'skan.gif', { type: 'image/gif' }),
      // The picker's `accept` would hide it; a drag and drop or another browser may not.
      { applyAccept: false },
    );
    await userEvent.click(submit);
    expect(await screen.findByText('Dozwolone są pliki PDF, JPG, PNG i WebP.')).toBeVisible();

    expect(fetch.mock.calls.some(([request]) => request.method === 'POST')).toBe(false);
  });

  it('shows the translated API refusal', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([myOrg]),
      [`GET /api/v1/waters/${WATER_ID}`]: () => jsonResponse(zegrzeDetail),
      [`GET ${ORG_CLAIMS}`]: () => jsonResponse([]),
      [`POST ${ORG_CLAIMS}`]: () => apiError('CLAIM_ALREADY_PENDING', 409),
    });
    renderRoute(`/org/${ORG_ID}/claims?waterId=${WATER_ID}`, { accessToken: 'access-1' });

    await screen.findByText('Zalew Zegrzyński · mazowieckie');
    await userEvent.upload(screen.getByLabelText('Dokument'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij wniosek' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wniosek o przejęcie tego łowiska jest już rozpatrywany.',
    );
  });

  it('shows only the access error for another organization', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
      [`GET ${ORG_CLAIMS}`]: () => apiError('ORG_SCOPE_VIOLATION', 403),
    });

    renderRoute(`/org/${ORG_ID}/claims`, { accessToken: 'access-1' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta operacja dotyczy innej organizacji.',
    );
    expect(screen.queryByRole('button', { name: 'Wyślij wniosek' })).not.toBeInTheDocument();
  });
});

describe('admin claims page', () => {
  const admin = { ...profile, isSuperAdmin: true };
  let click: Mock<(this: HTMLAnchorElement) => void>;

  beforeEach(() => {
    click = vi.fn<(this: HTMLAnchorElement) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    // jsdom has no object URLs (and every test file gets a fresh jsdom).
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:claim'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const queue = (claims: AdminClaim[]) => () => jsonResponse(claims);
  const claimStatusQuery = (fetch: ReturnType<typeof mockApi>) =>
    fetch.mock.calls
      .map(([request]) => new URL(request.url))
      .filter((url) => url.pathname === '/api/v1/admin/claims')
      .map((url) => url.searchParams.get('status'));

  it('shows pending claims with the organization, and the admin link in the header', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': queue([pendingAdminClaim]),
    });

    renderRoute('/admin/claims', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Zalew Zegrzyński' });
    expect(within(card).getByText('Koło PZW nr 12')).toBeVisible();
    expect(within(card).getByText('5260250274')).toBeVisible();
    expect(within(card).getByText('Oczekuje na decyzję')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('PENDING');
    expect(claimStatusQuery(fetch)).toEqual(['PENDING']);
    expect(await screen.findByRole('link', { name: 'Administracja' })).toHaveAttribute(
      'href',
      '/admin/claims',
    );
  });

  it('approves a claim after confirming and reloads the queue', async () => {
    let claims = [pendingAdminClaim];
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': () => jsonResponse(claims),
      [`PATCH /api/v1/admin/claims/${pendingAdminClaim.id}`]: () => {
        claims = [];
        return jsonResponse({ ...pendingAdminClaim, status: 'APPROVED' });
      },
    });
    renderRoute('/admin/claims', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Zalew Zegrzyński' });
    await userEvent.click(within(card).getByRole('button', { name: 'Zatwierdź' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Tak, zatwierdź' }));

    expect(await screen.findByText('Brak wniosków o tym statusie.')).toBeVisible();
    expect(await sentBodies(fetch, `PATCH /api/v1/admin/claims/${pendingAdminClaim.id}`)).toEqual([
      { decision: 'APPROVE' },
    ]);
  });

  it('sends nothing until the approval is confirmed, and can be cancelled', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': queue([pendingAdminClaim]),
    });
    renderRoute('/admin/claims', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Zalew Zegrzyński' });
    await userEvent.click(within(card).getByRole('button', { name: 'Zatwierdź' }));

    expect(within(card).getByText(/pozostałe wnioski o nie — odrzucone/)).toBeVisible();
    await userEvent.click(within(card).getByRole('button', { name: 'Anuluj' }));
    expect(within(card).getByRole('button', { name: 'Zatwierdź' })).toBeVisible();
    expect(fetch.mock.calls.some(([request]) => request.method === 'PATCH')).toBe(false);
  });

  it('rejects with a comment', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': queue([pendingAdminClaim]),
      [`PATCH /api/v1/admin/claims/${pendingAdminClaim.id}`]: () =>
        jsonResponse({ ...pendingAdminClaim, status: 'REJECTED' }),
    });
    renderRoute('/admin/claims', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Zalew Zegrzyński' });
    await userEvent.type(within(card).getByLabelText('Komentarz dla organizacji'), ' Brak umowy ');
    await userEvent.click(within(card).getByRole('button', { name: 'Odrzuć' }));

    await waitFor(async () =>
      expect(await sentBodies(fetch, `PATCH /api/v1/admin/claims/${pendingAdminClaim.id}`)).toEqual(
        [{ decision: 'REJECT', comment: 'Brak umowy' }],
      ),
    );
  });

  it('shows why a decision failed and offers to reload the queue', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': queue([pendingAdminClaim]),
      [`PATCH /api/v1/admin/claims/${pendingAdminClaim.id}`]: () =>
        apiError('CLAIM_NOT_PENDING', 409),
    });
    renderRoute('/admin/claims', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Zalew Zegrzyński' });
    await userEvent.click(within(card).getByRole('button', { name: 'Odrzuć' }));

    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'Ten wniosek został już rozpatrzony.',
    );
    // The decision buttons are gone: only reloading the queue makes sense now.
    expect(within(card).queryByRole('button', { name: 'Odrzuć' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Odśwież listę' }));
    await waitFor(() => expect(claimStatusQuery(fetch)).toEqual(['PENDING', 'PENDING']));
  });

  it('downloads the document with the access token', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': queue([pendingAdminClaim]),
      [`GET /api/v1/admin/claims/${pendingAdminClaim.id}/document`]: () =>
        new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } }),
    });
    renderRoute('/admin/claims', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Zalew Zegrzyński' });
    await userEvent.click(within(card).getByRole('button', { name: 'Pobierz dokument' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(click.mock.contexts[0]?.download).toBe(`claim-${pendingAdminClaim.id}.pdf`);
    const request = fetch.mock.calls
      .map(([sent]) => sent)
      .find((sent) => new URL(sent.url).pathname.endsWith('/document'));
    expect(request?.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('switches the filter to every claim', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(admin),
      'GET /api/v1/admin/claims': queue([]),
    });
    renderRoute('/admin/claims', { accessToken: 'access-1' });
    await screen.findByText('Brak wniosków o tym statusie.');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Wszystkie');

    await waitFor(() => expect(claimStatusQuery(fetch)).toEqual(['PENDING', null]));
  });
});
