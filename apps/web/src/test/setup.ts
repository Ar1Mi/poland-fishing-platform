import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { resetSessionForTests } from '../shared/auth/session';
import { deviceDb } from '../shared/offline/db';
import { resetDeviceRefreshForTests } from '../shared/offline/device-data';
import { DEFAULT_LOCALE, i18n } from '../shared/i18n/i18n';
import { takeUnexpectedRequests } from './unexpected-requests';

beforeEach(() => {
  // A request of the previous test that came after its check belongs to nobody.
  takeUnexpectedRequests();
});

afterEach(async () => {
  cleanup();
  resetSessionForTests();
  resetDeviceRefreshForTests();
  vi.unstubAllGlobals();
  // IndexedDB (fake-indexeddb) outlives a test: the next one starts with an empty device.
  await Promise.all(deviceDb.tables.map((table) => table.clear()));
  await i18n.changeLanguage(DEFAULT_LOCALE);
  localStorage.clear();
  expect(takeUnexpectedRequests(), 'requests without a mockApi handler').toEqual([]);
});
