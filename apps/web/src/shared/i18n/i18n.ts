import { Locale } from '@lowisko/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enHome from './locales/en/home.json';
import plCommon from './locales/pl/common.json';
import plErrors from './locales/pl/errors.json';
import plHome from './locales/pl/home.json';
import ruCommon from './locales/ru/common.json';
import ruErrors from './locales/ru/errors.json';
import ruHome from './locales/ru/home.json';

/*
 * One file per feature (`locales/{lng}/{feature}.json`), merged under the feature name into
 * a single i18next namespace, so keys read `feature.component.element` (docs/06-frontend.md).
 * `pl` is complete; a key missing in `en`/`ru` falls back to `pl` until the localisation stage (T-31).
 */
export const resources = {
  pl: { translation: { common: plCommon, home: plHome, errors: plErrors } },
  en: { translation: { common: enCommon, home: enHome, errors: enErrors } },
  ru: { translation: { common: ruCommon, home: ruHome, errors: ruErrors } },
} as const;

export const LOCALES = Object.values(Locale);
export const DEFAULT_LOCALE: Locale = Locale.pl;

/** The language choice is not sensitive and may live in localStorage (frontend rules). */
const STORAGE_KEY = 'lowisko.locale';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    // Storage may be blocked (private mode, browser settings): start in Polish.
    return DEFAULT_LOCALE;
  }
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Not remembered between visits; the switch itself still works.
  }
});

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: LOCALES,
  initAsync: false,
  // React escapes output itself.
  interpolation: { escapeValue: false },
});

export { i18n };
