import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockApi, renderRoute } from '../../../test/render';

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

describe('my organizations page', () => {
  it('links the sections of an active organization and explains an inactive one', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () =>
        jsonResponse([
          { id: 'a1', name: 'Koło 12', kind: 'PZW', status: 'ACTIVE', roles: ['ORG_ADMIN'] },
          {
            id: 'b2',
            name: 'Gospodarstwo',
            kind: 'PRIVATE',
            status: 'PENDING',
            roles: ['ORG_ADMIN'],
          },
          { id: 'c3', name: 'Koło 7', kind: 'PZW', status: 'ACTIVE', roles: ['INSPECTOR'] },
        ]),
    });

    renderRoute('/org', { accessToken: 'access-1' });

    const active = await screen.findByRole('region', { name: 'Koło 12' });
    expect(within(active).getByRole('link', { name: 'Wnioski o łowiska' })).toHaveAttribute(
      'href',
      '/org/a1/claims',
    );
    expect(within(active).getByRole('link', { name: 'Rodzaje zezwoleń' })).toHaveAttribute(
      'href',
      '/org/a1/permit-types',
    );
    expect(within(active).getByRole('link', { name: 'Protokoły kontroli' })).toHaveAttribute(
      'href',
      '/org/a1/inspections',
    );
    expect(within(active).getByText('Administrator')).toBeVisible();
    const pending = screen.getByRole('region', { name: 'Gospodarstwo' });
    expect(
      within(pending).getByText('Organizacja czeka na aktywację przez administratora serwisu.'),
    ).toBeVisible();
    expect(within(pending).queryByRole('link')).toBeNull();
    const inspector = screen.getByRole('region', { name: 'Koło 7' });
    expect(within(inspector).getByText('Strażnik')).toBeVisible();
    expect(within(inspector).queryByRole('link')).toBeNull();
    expect(
      within(inspector).getByText(
        'Aby skontrolować wędkarza, zeskanuj aparatem telefonu kod QR z jego zezwolenia.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Moje organizacje' })).toHaveAttribute('href', '/org');
  });

  it('says when the user belongs to no organization', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/me/orgs': () => jsonResponse([]),
    });

    renderRoute('/org', { accessToken: 'access-1' });

    expect(await screen.findByText('Nie należysz do żadnej organizacji.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Administracja' })).toBeNull();
  });
});
