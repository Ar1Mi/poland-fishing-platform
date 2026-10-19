import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { DEFAULT_LOCALE, i18n } from '../shared/i18n/i18n';

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await i18n.changeLanguage(DEFAULT_LOCALE);
  localStorage.clear();
});
