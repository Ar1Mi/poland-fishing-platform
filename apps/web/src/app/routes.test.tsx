import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderRoute } from '../test/render';

const healthy = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', time: '2026-10-06T15:20:00.000Z' })),
  );

describe('routes', () => {
  it('shows the 404 page with a link home for an unknown path', async () => {
    renderRoute('/no-such-page');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nie znaleziono strony' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Wróć na stronę główną' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows the API as connected on the home page', async () => {
    healthy();

    renderRoute('/');

    expect(await screen.findByText('Połączono')).toBeVisible();
  });

  it('shows a translated message with the code when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderRoute('/');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Brak połączenia z serwerem/)).toBeVisible();
    expect(within(alert).getByText('NETWORK_ERROR')).toBeVisible();
  });
});

describe('language switcher', () => {
  it('starts in Polish', () => {
    renderRoute('/no-such-page');

    expect(screen.getByRole('combobox', { name: 'Język' })).toHaveValue('pl');
    expect(document.documentElement.lang).toBe('pl');
  });

  it('switches the interface language, the page lang and remembers the choice', async () => {
    renderRoute('/no-such-page');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Język' }), 'English');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lowisko.locale')).toBe('en');
  });

  it('falls back to Polish for a key not yet translated', async () => {
    healthy();
    renderRoute('/');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Język' }), 'Русский');

    // home.json in ru is empty until the localisation stage (T-31).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Łowiska w Polsce' }),
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Язык' })).toHaveValue('ru');
  });
});
