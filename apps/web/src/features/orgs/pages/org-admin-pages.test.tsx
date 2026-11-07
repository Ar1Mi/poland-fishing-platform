import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';
import type { Invitation, Member } from '../api/useMembers';
import type { Organization } from '../api/useOrganizations';

const ORG_ID = '2d9f6c1e-1c1e-4f43-9a51-0d6c2f0d9a13';
const ME = '6f1c2c9e-0000-4000-8000-000000000001';
const PIOTR = '6f1c2c9e-0000-4000-8000-000000000002';

const profile = {
  id: ME,
  email: 'marek@example.test',
  firstName: 'Marek',
  lastName: 'Lewandowski',
  birthDate: '1971-11-23',
  anglerCardNo: null,
  locale: 'pl',
  isSuperAdmin: true,
};

const errorBody = (code: string, status: number) => jsonResponse({ code, message: code }, status);

describe('organization application', () => {
  it('sends the application with the NIP as digits and says it waits for activation', async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
      'POST /api/v1/orgs': () =>
        jsonResponse(
          {
            id: ORG_ID,
            name: 'Koło PZW Ukleja',
            nip: '5260250274',
            kind: 'PZW',
            status: 'PENDING',
            contactEmail: 'kolo@example.test',
            createdAt: '2026-10-06T10:00:00.000Z',
          },
          201,
        ),
    });
    renderRoute('/org/new', { accessToken: 'access-1' });

    await user.type(await screen.findByLabelText('Nazwa organizacji'), 'Koło PZW Ukleja');
    await user.type(screen.getByLabelText('NIP'), '526-025-02-73');
    await user.selectOptions(screen.getByLabelText('Rodzaj'), 'Koło lub okręg PZW');
    await user.type(screen.getByLabelText('E-mail kontaktowy organizacji'), 'kolo@example.test');
    await user.click(screen.getByRole('button', { name: 'Wyślij zgłoszenie' }));

    // A wrong checksum is caught before sending.
    expect(await screen.findByText('Nieprawidłowy NIP — sprawdź cyfry.')).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/orgs')).toEqual([]);

    await user.clear(screen.getByLabelText('NIP'));
    await user.type(screen.getByLabelText('NIP'), '526-025-02-74');
    await user.click(screen.getByRole('button', { name: 'Wyślij zgłoszenie' }));

    expect(await screen.findByText('Zgłoszenie „Koło PZW Ukleja” wysłane')).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/orgs')).toEqual([
      {
        name: 'Koło PZW Ukleja',
        nip: '5260250274',
        kind: 'PZW',
        contactEmail: 'kolo@example.test',
      },
    ]);
  });

  it('shows a NIP already registered', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
      'POST /api/v1/orgs': () => errorBody('NIP_TAKEN', 409),
    });
    renderRoute('/org/new', { accessToken: 'access-1' });

    await user.type(await screen.findByLabelText('Nazwa organizacji'), 'Koło');
    await user.type(screen.getByLabelText('NIP'), '5260250274');
    await user.selectOptions(screen.getByLabelText('Rodzaj'), 'Łowisko prywatne');
    await user.type(screen.getByLabelText('E-mail kontaktowy organizacji'), 'kolo@example.test');
    await user.click(screen.getByRole('button', { name: 'Wyślij zgłoszenie' }));

    expect(
      await screen.findByText('Organizacja z tym numerem NIP jest już zarejestrowana.'),
    ).toBeVisible();
  });

  it('is linked from my organizations', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () =>
        jsonResponse([
          { id: ORG_ID, name: 'Koło 12', kind: 'PZW', status: 'ACTIVE', roles: ['ORG_ADMIN'] },
        ]),
    });
    renderRoute('/org', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Koło 12' });
    for (const [name, path] of [
      ['Łowiska', 'waters'],
      ['Sprzedane zezwolenia', 'permits'],
      ['Członkowie i zaproszenia', 'members'],
    ]) {
      expect(within(card).getByRole('link', { name })).toHaveAttribute(
        'href',
        `/org/${ORG_ID}/${path}`,
      );
    }
    expect(screen.getByRole('link', { name: 'Zgłoś organizację do serwisu' })).toHaveAttribute(
      'href',
      '/org/new',
    );
  });
});

describe('organizations of the super admin', () => {
  const organization = (data: Partial<Organization>): Organization => ({
    id: ORG_ID,
    name: 'Koło PZW Ukleja',
    nip: '5260250274',
    kind: 'PZW',
    status: 'PENDING',
    contactEmail: 'kolo@example.test',
    createdAt: '2026-10-06T10:00:00.000Z',
    ...data,
  });

  it('lists the applications waiting and activates one', async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/admin/orgs': () => jsonResponse([organization({})]),
      [`PATCH /api/v1/admin/orgs/${ORG_ID}/status`]: () =>
        jsonResponse(organization({ status: 'ACTIVE' })),
    });
    renderRoute('/admin/orgs', { accessToken: 'access-1' });

    const card = await screen.findByRole('region', { name: 'Koło PZW Ukleja' });
    expect(within(card).getByText('5260250274')).toBeVisible();
    expect(
      fetch.mock.calls.map(([request]) => new URL(request.url).search).filter(Boolean),
    ).toContain('?status=PENDING');
    await user.click(
      within(card).getByRole('button', { name: 'Aktywuj organizację Koło PZW Ukleja' }),
    );

    await waitFor(async () =>
      expect(await sentBodies(fetch, `PATCH /api/v1/admin/orgs/${ORG_ID}/status`)).toEqual([
        { status: 'ACTIVE' },
      ]),
    );
    expect(screen.getByRole('navigation', { name: 'Administracja serwisu' })).toBeVisible();
  });

  it('blocks an active organization only after confirming', async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/admin/orgs': () => jsonResponse([organization({ status: 'ACTIVE' })]),
      [`PATCH /api/v1/admin/orgs/${ORG_ID}/status`]: () =>
        jsonResponse(organization({ status: 'BLOCKED' })),
    });
    renderRoute('/admin/orgs?status=ACTIVE', { accessToken: 'access-1' });

    await user.click(
      await screen.findByRole('button', { name: 'Zablokuj organizację Koło PZW Ukleja' }),
    );
    expect(await sentBodies(fetch, `PATCH /api/v1/admin/orgs/${ORG_ID}/status`)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Tak, zablokuj' }));

    await waitFor(async () =>
      expect(await sentBodies(fetch, `PATCH /api/v1/admin/orgs/${ORG_ID}/status`)).toEqual([
        { status: 'BLOCKED' },
      ]),
    );
  });
});

describe('members and invitations', () => {
  const members: Member[] = [
    {
      userId: ME,
      firstName: 'Marek',
      lastName: 'Lewandowski',
      email: 'marek@example.test',
      roles: ['ORG_ADMIN'],
      since: '2026-01-02T10:00:00.000Z',
    },
    {
      userId: PIOTR,
      firstName: 'Piotr',
      lastName: 'Zieliński',
      email: 'piotr@example.test',
      roles: ['INSPECTOR'],
      since: '2026-03-02T10:00:00.000Z',
    },
  ];
  const invitation: Invitation = {
    id: 'a1000000-0000-4000-8000-000000000001',
    email: 'old@example.test',
    role: 'INSPECTOR',
    expiresAt: '2026-10-01T10:00:00.000Z',
    expired: true,
  };
  const page = (handlers: Record<string, () => Response> = {}) => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      [`GET /api/v1/orgs/${ORG_ID}/members`]: () => jsonResponse(members),
      [`GET /api/v1/orgs/${ORG_ID}/invitations`]: () => jsonResponse([invitation]),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
      ...handlers,
    });
    renderRoute(`/org/${ORG_ID}/members`, { accessToken: 'access-1' });
    return fetch;
  };

  it('invites an inspector by email', async () => {
    const user = userEvent.setup();
    const fetch = page({
      [`POST /api/v1/orgs/${ORG_ID}/invitations`]: () =>
        jsonResponse({ ...invitation, email: 'nowy@example.test', expired: false }, 201),
    });

    await user.type(await screen.findByLabelText('E-mail'), 'nowy@example.test');
    await user.click(screen.getByRole('button', { name: 'Wyślij zaproszenie' }));

    expect(await screen.findByText('Zaproszenie wysłane na nowy@example.test.')).toBeVisible();
    expect(await sentBodies(fetch, `POST /api/v1/orgs/${ORG_ID}/invitations`)).toEqual([
      { email: 'nowy@example.test', role: 'INSPECTOR' },
    ]);
    expect(screen.getByLabelText('E-mail')).toHaveValue('');
  });

  it('shows a pending invitation that expired, sends it again or cancels it', async () => {
    const user = userEvent.setup();
    const fetch = page({
      [`POST /api/v1/orgs/${ORG_ID}/invitations`]: () =>
        jsonResponse({ ...invitation, expired: false }, 201),
      [`DELETE /api/v1/orgs/${ORG_ID}/invitations/${invitation.id}`]: noContent,
    });

    const pending = await screen.findByRole('region', { name: 'Zaproszenia oczekujące' });
    expect(within(pending).getByText(/link wygasł/)).toBeVisible();
    await user.click(
      within(pending).getByRole('button', {
        name: 'Wyślij ponownie zaproszenie dla old@example.test',
      }),
    );
    await user.click(
      within(pending).getByRole('button', { name: 'Anuluj zaproszenie dla old@example.test' }),
    );

    await waitFor(async () =>
      expect(await sentBodies(fetch, `POST /api/v1/orgs/${ORG_ID}/invitations`)).toEqual([
        { email: 'old@example.test', role: 'INSPECTOR' },
      ]),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([request]) =>
            request.method === 'DELETE' &&
            new URL(request.url).pathname.endsWith(`/invitations/${invitation.id}`),
        ),
      ).toBe(true),
    );
  });

  it('changes the roles of a member and shows why the last admin stays', async () => {
    const user = userEvent.setup();
    const fetch = page({
      [`PATCH /api/v1/orgs/${ORG_ID}/members/${PIOTR}`]: () =>
        jsonResponse({ ...members[1], roles: ['ORG_ADMIN', 'INSPECTOR'] }),
      [`PATCH /api/v1/orgs/${ORG_ID}/members/${ME}`]: () => errorBody('LAST_ORG_ADMIN', 409),
    });

    const piotr = await screen.findByRole('region', { name: 'Piotr Zieliński' });
    const save = within(piotr).getByRole('button', { name: 'Zapisz role' });
    expect(save).toBeDisabled();
    await user.click(within(piotr).getByRole('checkbox', { name: 'Administrator' }));
    await user.click(save);
    await waitFor(async () =>
      expect(await sentBodies(fetch, `PATCH /api/v1/orgs/${ORG_ID}/members/${PIOTR}`)).toEqual([
        { roles: ['ORG_ADMIN', 'INSPECTOR'] },
      ]),
    );

    const me = screen.getByRole('region', { name: /Marek Lewandowski/ });
    expect(within(me).getByText('(Ty)')).toBeVisible();
    await user.click(within(me).getByRole('checkbox', { name: 'Administrator' }));
    // Without any role a member is removed instead.
    expect(within(me).getByRole('button', { name: 'Zapisz role' })).toBeDisabled();
    await user.click(within(me).getByRole('checkbox', { name: 'Strażnik' }));
    await user.click(within(me).getByRole('button', { name: 'Zapisz role' }));

    expect(
      await within(me).findByText(/musi mieć co najmniej jednego administratora/),
    ).toBeVisible();
  });

  it('removes a member after confirming', async () => {
    const user = userEvent.setup();
    const fetch = page({ [`DELETE /api/v1/orgs/${ORG_ID}/members/${PIOTR}`]: noContent });

    const piotr = await screen.findByRole('region', { name: 'Piotr Zieliński' });
    await user.click(
      within(piotr).getByRole('button', { name: 'Usuń z organizacji: Piotr Zieliński' }),
    );
    await user.click(within(piotr).getByRole('button', { name: 'Tak, usuń' }));

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([request]) =>
            request.method === 'DELETE' && new URL(request.url).pathname.endsWith(PIOTR),
        ),
      ).toBe(true),
    );
  });

  it('shows the refusal of the API and no forms', async () => {
    page({ [`GET /api/v1/orgs/${ORG_ID}/members`]: () => errorBody('ORG_SCOPE_VIOLATION', 403) });

    expect(await screen.findByText('Ta operacja dotyczy innej organizacji.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Wyślij zaproszenie' })).toBeNull();
  });
});

describe('accepting an invitation', () => {
  const show = (token: string, accept: () => Response) => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse({ ...profile, email: 'piotr@example.test' }),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
      'POST /api/v1/invitations/accept': accept,
    });
    renderRoute(`/invitations/accept?token=${token}`, { accessToken: 'access-1' });
    return fetch;
  };

  it('accepts only on a click and says what the user became', async () => {
    const user = userEvent.setup();
    const fetch = show('tok-1', () =>
      jsonResponse({ organization: { id: ORG_ID, name: 'Koło PZW Ukleja' }, role: 'INSPECTOR' }),
    );

    expect(await screen.findByText(/jako piotr@example.test/)).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/invitations/accept')).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Przyjmij zaproszenie' }));

    expect(
      await screen.findByText('Dołączyłeś do organizacji Koło PZW Ukleja jako Strażnik'),
    ).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/invitations/accept')).toEqual([
      { token: 'tok-1' },
    ]);
    expect(screen.getByRole('link', { name: 'Przejdź do „Moje organizacje”' })).toHaveAttribute(
      'href',
      '/org',
    );
  });

  it('explains an invitation for another address', async () => {
    const user = userEvent.setup();
    show('tok-1', () => errorBody('INVITATION_EMAIL_MISMATCH', 403));

    await user.click(await screen.findByRole('button', { name: 'Przyjmij zaproszenie' }));

    expect(await screen.findByText(/dla innego adresu e-mail/)).toBeVisible();
    expect(screen.getByText(/Wyloguj się i zaloguj na konto z adresem/)).toBeVisible();
  });

  it('shows an expired invitation', async () => {
    const user = userEvent.setup();
    show('tok-1', () => errorBody('INVITATION_EXPIRED', 422));

    await user.click(await screen.findByRole('button', { name: 'Przyjmij zaproszenie' }));

    expect(
      await screen.findByText('Zaproszenie wygasło. Poproś organizację o nowe.'),
    ).toBeVisible();
  });

  it('says that a link without its code does not work', async () => {
    mockApi({ 'GET /api/v1/me': () => jsonResponse(profile) });
    renderRoute('/invitations/accept', { accessToken: 'access-1' });

    expect(await screen.findByText(/brakuje kodu zaproszenia/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Przyjmij zaproszenie' })).toBeNull();
  });

  it('sends a guest to log in first', async () => {
    mockApi({});
    renderRoute('/invitations/accept?token=tok-1');

    expect(await screen.findByRole('button', { name: 'Zaloguj się' })).toBeVisible();
  });
});
