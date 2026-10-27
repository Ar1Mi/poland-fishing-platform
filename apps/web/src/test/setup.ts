import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { resetSessionForTests } from '../shared/auth/session';
import { DEFAULT_LOCALE, i18n } from '../shared/i18n/i18n';
import { takeUnexpectedRequests } from './unexpected-requests';

beforeEach(() => {
  // A request of the previous test that came after its check belongs to nobody.
  takeUnexpectedRequests();
});

afterEach(async () => {
  cleanup();
  resetSessionForTests();
  vi.unstubAllGlobals();
  await i18n.changeLanguage(DEFAULT_LOCALE);
  localStorage.clear();
  expect(takeUnexpectedRequests(), 'requests without a mockApi handler').toEqual([]);
});
