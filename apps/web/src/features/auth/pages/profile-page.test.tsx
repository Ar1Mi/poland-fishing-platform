import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { getAccessToken } from '../../../shared/auth/session';
import { deviceDb } from '../../../shared/offline/db';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';

const USER_ID = '6f1c2c9e-0000-4000-8000-000000000001';
const profile = {
  id: USER_ID,
  email: 'jan@example.test',
  firstName: 'Jan',
  lastName: 'Kowalski',
  birthDate: '1990-05-01',
  anglerCardNo: 'KW-123',
  locale: 'pl',
  isSuperAdmin: false,
};
const apiError = (code: string, status: number, details = {}) =>
  jsonResponse({ code, message: code, details }, status);
const field = (name: string | RegExp) => screen.getByLabelText(name);

/** The profile page of a logged-in user, with `handlers` for the other requests. */
const show = (handlers: Parameters<typeof mockApi>[0] = {}) => {
  const fetch = mockApi({ 'GET /api/v1/me': () => jsonResponse(profile), ...handlers });
  renderRoute('/me/profile', { accessToken: 'access-1' });
  return fetch;
};

describe('profile page', () => {
  it('shows the profile and saves only the changed fields', async () => {
    const fetch = show({
      'PATCH /api/v1/me': () => jsonResponse({ ...profile, lastName: 'Nowak' }),
    });

    expect(await screen.findByText('jan@example.test')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();
    expect(field('Imię')).toHaveValue('Jan');
    expect(field(/Numer karty/)).toHaveValue('KW-123');
    await userEvent.clear(field('Nazwisko'));
    await userEvent.type(field('Nazwisko'), 'Nowak');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(await screen.findByText('Zmiany zostały zapisane.')).toBeVisible();
    expect(await sentBodies(fetch, 'PATCH /api/v1/me')).toEqual([{ lastName: 'Nowak' }]);
  });

  it('removes the angler card number when the field is emptied', async () => {
    const fetch = show({
      'PATCH /api/v1/me': () => jsonResponse({ ...profile, anglerCardNo: null }),
    });

    await userEvent.clear(await screen.findByLabelText(/Numer karty/));
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    await waitFor(async () =>
      expect(await sentBodies(fetch, 'PATCH /api/v1/me')).toEqual([{ anglerCardNo: null }]),
    );
  });

  it('is in the bottom navigation as «Profil»', async () => {
    show();

    const nav = await screen.findByRole('navigation', { name: 'Nawigacja główna' });
    expect(within(nav).getByRole('link', { name: 'Profil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  describe('data export', () => {
    let click: Mock<(this: HTMLAnchorElement) => void>;

    beforeEach(() => {
      click = vi.fn<(this: HTMLAnchorElement) => void>();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
      // jsdom has no object URLs.
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:json'), revokeObjectURL: vi.fn() });
    });

    it('downloads all the data as a JSON file with the access token', async () => {
      const fetch = show({
        'GET /api/v1/me/export': () =>
          new Response('{"format":"lowisko-account-export"}', {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }),
      });

      await userEvent.click(await screen.findByRole('button', { name: 'Pobierz moje dane' }));

      await waitFor(() => expect(click).toHaveBeenCalledOnce());
      expect(click.mock.contexts[0]?.download).toMatch(/^lowisko-dane-\d{4}-\d{2}-\d{2}\.json$/);
      const request = fetch.mock.calls
        .map(([sent]) => sent)
        .find((sent) => new URL(sent.url).pathname === '/api/v1/me/export');
      expect(request?.headers.get('Authorization')).toBe('Bearer access-1');
    });
  });

  describe('account deletion', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Usuń konto' }));
      return field('Potwierdź hasłem');
    };

    it('asks for the password, then deletes and forgets the user on this device', async () => {
      await deviceDb.catchQueue.put({
        clientId: '00000000-0000-4000-8000-0000000000aa',
        userId: USER_ID,
        status: 'PENDING_SYNC',
      } as never);
      const fetch = show({ 'DELETE /api/v1/me': noContent });

      const password = await open();
      expect(password).toHaveFocus();
      await userEvent.type(password, 'correct horse');
      await userEvent.click(screen.getByRole('button', { name: 'Usuń konto na zawsze' }));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Konto usunięte' }),
      ).toBeVisible();
      await waitFor(() => expect(getAccessToken()).toBeNull());
      // The session ends under the public page: no redirect to the login page.
      expect(await screen.findByRole('link', { name: 'Zaloguj się' })).toBeVisible();
      expect(screen.getByRole('heading', { level: 1, name: 'Konto usunięte' })).toBeVisible();
      expect(await sentBodies(fetch, 'DELETE /api/v1/me')).toEqual([{ password: 'correct horse' }]);
      await waitFor(async () => expect(await deviceDb.catchQueue.count()).toBe(0));
    });

    it('says the password is wrong without refreshing the session', async () => {
      const fetch = show({
        'DELETE /api/v1/me': () => apiError('INVALID_CREDENTIALS', 401),
      });

      await userEvent.type(await open(), 'wrong');
      await userEvent.click(screen.getByRole('button', { name: 'Usuń konto na zawsze' }));

      expect(await screen.findByText('Nieprawidłowe hasło.')).toBeVisible();
      expect(field('Potwierdź hasłem')).toHaveAttribute('aria-invalid', 'true');
      expect(getAccessToken()).toBe('access-1');
      const deletes = fetch.mock.calls.filter(([sent]) => sent.method === 'DELETE');
      expect(deletes).toHaveLength(1);
    });

    it('sends the last admin of an organization to hand the role over', async () => {
      show({
        'DELETE /api/v1/me': () => apiError('LAST_ORG_ADMIN', 409, { organizationIds: ['org-1'] }),
      });

      await userEvent.type(await open(), 'correct horse');
      await userEvent.click(screen.getByRole('button', { name: 'Usuń konto na zawsze' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Jesteś jedynym administratorem aktywnej organizacji');
      expect(
        within(alert).getByRole('link', { name: 'Przejdź do moich organizacji' }),
      ).toHaveAttribute('href', '/org');
      expect(getAccessToken()).toBe('access-1');
    });

    it('keeps the session when the confirmation page is opened by hand', async () => {
      mockApi({ 'GET /api/v1/me': () => jsonResponse(profile) });
      renderRoute('/account-deleted', { accessToken: 'access-1' });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Konto usunięte' }),
      ).toBeVisible();
      expect(await screen.findByRole('button', { name: 'Wyloguj się' })).toBeVisible();
      expect(getAccessToken()).toBe('access-1');
    });

    it('requires the password before sending anything and can be cancelled', async () => {
      const fetch = show();

      await open();
      await userEvent.click(screen.getByRole('button', { name: 'Usuń konto na zawsze' }));

      expect(await screen.findByText('Podaj hasło.')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Usuń konto' })).toHaveFocus());
      expect(fetch.mock.calls.filter(([sent]) => sent.method === 'DELETE')).toHaveLength(0);
    });
  });
});
