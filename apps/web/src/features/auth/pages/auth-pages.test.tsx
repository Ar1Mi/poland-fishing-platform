import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { getAccessToken } from '../../../shared/auth/session';
import { jsonResponse, mockApi, noContent, renderRoute, sentBodies } from '../../../test/render';

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
const health = () => jsonResponse({ status: 'ok', time: '2026-10-06T15:20:00.000Z' });
const apiError = (code: string, status: number) => jsonResponse({ code, message: code }, status);

const field = (name: string | RegExp) => screen.getByLabelText(name);

describe('login', () => {
  it('logs in, keeps the token in memory and goes to the home page', async () => {
    const fetch = mockApi({
      'POST /api/v1/auth/login': () => jsonResponse({ accessToken: 'access-1' }),
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/health': health,
    });
    renderRoute('/login');

    await userEvent.type(field('E-mail'), 'jan@example.test');
    await userEvent.type(field('Hasło'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Łowiska w Polsce' }),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Wyloguj się' })).toBeVisible();
    expect(getAccessToken()).toBe('access-1');
    expect(localStorage.length).toBeLessThanOrEqual(1); // only lowisko.locale, never the token
    expect(await sentBodies(fetch, 'POST /api/v1/auth/login')).toEqual([
      { email: 'jan@example.test', password: 'correct horse' },
    ]);
  });

  it('shows the translated error for wrong credentials', async () => {
    mockApi({ 'POST /api/v1/auth/login': () => apiError('INVALID_CREDENTIALS', 401) });
    renderRoute('/login');

    await userEvent.type(field('E-mail'), 'jan@example.test');
    await userEvent.type(field('Hasło'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Nieprawidłowy e-mail lub hasło.')).toBeVisible();
  });

  it('checks the fields before sending anything', async () => {
    const fetch = mockApi({});
    renderRoute('/login');

    await userEvent.type(field('E-mail'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(await screen.findByText('Podaj poprawny adres e-mail.')).toBeVisible();
    expect(screen.getByText('Podaj hasło.')).toBeVisible();
    expect(field('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a logged-in user away from the login page', async () => {
    mockApi({ 'GET /api/v1/me': () => jsonResponse(profile), 'GET /api/v1/health': health });
    renderRoute('/login', { accessToken: 'access-1' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Łowiska w Polsce' }),
    ).toBeVisible();
  });
});

describe('registration', () => {
  const fill = async () => {
    await userEvent.type(field('E-mail'), 'jan@example.test');
    await userEvent.type(field('Hasło'), 'correct horse');
    await userEvent.type(field('Imię'), 'Jan');
    await userEvent.type(field('Nazwisko'), 'Kowalski');
    await userEvent.type(field('Data urodzenia'), '1990-05-01');
  };

  it('requires the privacy policy consent', async () => {
    const fetch = mockApi({});
    renderRoute('/register');

    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto' }));

    expect(
      await screen.findByText('Zaakceptuj politykę prywatności, aby założyć konto.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'politykę prywatności' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('registers in the current language and asks to check the mailbox', async () => {
    const fetch = mockApi({ 'POST /api/v1/auth/register': noContent });
    renderRoute('/register');

    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /Akceptuję/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto' }));

    expect(await screen.findByText('Sprawdź skrzynkę')).toBeVisible();
    expect(screen.getByText(/jan@example\.test/)).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/auth/register')).toEqual([
      {
        email: 'jan@example.test',
        password: 'correct horse',
        firstName: 'Jan',
        lastName: 'Kowalski',
        birthDate: '1990-05-01',
        acceptTerms: true,
        locale: 'pl',
      },
    ]);
  });

  it('shows EMAIL_TAKEN from the API', async () => {
    mockApi({ 'POST /api/v1/auth/register': () => apiError('EMAIL_TAKEN', 409) });
    renderRoute('/register');

    await fill();
    await userEvent.click(screen.getByRole('checkbox', { name: /Akceptuję/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Załóż konto' }));

    expect(await screen.findByText('Konto z tym adresem e-mail już istnieje.')).toBeVisible();
  });
});

describe('email confirmation', () => {
  it('sends the token from the link once and offers to log in', async () => {
    const fetch = mockApi({ 'POST /api/v1/auth/verify-email': noContent });
    renderRoute('/verify-email?token=abc');

    expect(
      await screen.findByText('Adres e-mail potwierdzony. Możesz się zalogować.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Przejdź do logowania' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(await sentBodies(fetch, 'POST /api/v1/auth/verify-email')).toEqual([{ token: 'abc' }]);
  });

  it('explains a used link', async () => {
    mockApi({ 'POST /api/v1/auth/verify-email': () => apiError('INVALID_TOKEN', 400) });
    renderRoute('/verify-email?token=used');

    expect(
      await screen.findByText('Ten link jest nieprawidłowy lub został już użyty.'),
    ).toBeVisible();
  });

  it('treats a link without a token as invalid without calling the API', () => {
    const fetch = mockApi({});
    renderRoute('/verify-email');

    expect(screen.getByText('Ten link jest nieprawidłowy lub został już użyty.')).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('requests a link and gives the same answer for any email', async () => {
    const fetch = mockApi({ 'POST /api/v1/auth/forgot-password': noContent });
    renderRoute('/reset-password');

    await userEvent.type(field('E-mail'), 'jan@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij link' }));

    expect(await screen.findByText(/Jeśli konto z tym adresem istnieje/)).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/auth/forgot-password')).toEqual([
      { email: 'jan@example.test' },
    ]);
  });

  it('sets the new password from the link and returns to login with a notice', async () => {
    const fetch = mockApi({ 'POST /api/v1/auth/reset-password': noContent });
    renderRoute('/reset-password?token=xyz');

    await userEvent.type(field('Nowe hasło'), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz hasło' }));

    expect(
      await screen.findByText('Hasło zostało zmienione. Zaloguj się nowym hasłem.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Logowanie' })).toBeVisible();
    expect(await sentBodies(fetch, 'POST /api/v1/auth/reset-password')).toEqual([
      { token: 'xyz', password: 'a brand new password' },
    ]);
  });

  it('offers a new link when the link has expired', async () => {
    mockApi({ 'POST /api/v1/auth/reset-password': () => apiError('TOKEN_EXPIRED', 401) });
    renderRoute('/reset-password?token=old');

    await userEvent.type(field('Nowe hasło'), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz hasło' }));

    expect(await screen.findByText('Link wygasł. Poproś o nowy.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Poproś o nowy link' })).toHaveAttribute(
      'href',
      '/reset-password',
    );
  });
});

describe('account in the header', () => {
  it('logs out and shows the login link again', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/health': health,
      'POST /api/v1/auth/logout': noContent,
    });
    renderRoute('/', { accessToken: 'access-1' });

    await userEvent.click(await screen.findByRole('button', { name: 'Wyloguj się' }));

    expect(await screen.findByRole('link', { name: 'Zaloguj się' })).toBeVisible();
    expect(getAccessToken()).toBeNull();
    const [logout] = fetch.mock.calls.map(([r]) => r).filter((r) => r.url.endsWith('/logout'));
    expect(logout?.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('switches the interface to the language saved in the profile', async () => {
    mockApi({
      'GET /api/v1/me': () => jsonResponse({ ...profile, locale: 'en' }),
      'GET /api/v1/health': health,
    });
    renderRoute('/', { accessToken: 'access-1' });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    });
  });

  it('saves a language change in the profile of a logged-in user', async () => {
    const fetch = mockApi({
      'GET /api/v1/me': () => jsonResponse(profile),
      'GET /api/v1/health': health,
      'PATCH /api/v1/me': () => jsonResponse({ ...profile, locale: 'en' }),
    });
    renderRoute('/', { accessToken: 'access-1' });
    await screen.findByRole('button', { name: 'Wyloguj się' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Język' }), 'English');

    await waitFor(async () => {
      expect(await sentBodies(fetch, 'PATCH /api/v1/me')).toEqual([{ locale: 'en' }]);
    });
  });
});
