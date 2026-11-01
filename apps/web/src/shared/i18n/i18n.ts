import { Locale } from '@lowisko/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enAuth from './locales/en/auth.json';
import enCatalog from './locales/en/catalog.json';
import enCatches from './locales/en/catches.json';
import enClaims from './locales/en/claims.json';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enLegal from './locales/en/legal.json';
import enOrgs from './locales/en/orgs.json';
import enPermits from './locales/en/permits.json';
import enRules from './locales/en/rules.json';
import plAuth from './locales/pl/auth.json';
import plCatalog from './locales/pl/catalog.json';
import plCatches from './locales/pl/catches.json';
import plClaims from './locales/pl/claims.json';
import plCommon from './locales/pl/common.json';
import plErrors from './locales/pl/errors.json';
import plLegal from './locales/pl/legal.json';
import plOrgs from './locales/pl/orgs.json';
import plPermits from './locales/pl/permits.json';
import plRules from './locales/pl/rules.json';
import ruAuth from './locales/ru/auth.json';
import ruCatalog from './locales/ru/catalog.json';
import ruCatches from './locales/ru/catches.json';
import ruClaims from './locales/ru/claims.json';
import ruCommon from './locales/ru/common.json';
import ruErrors from './locales/ru/errors.json';
import ruLegal from './locales/ru/legal.json';
import ruOrgs from './locales/ru/orgs.json';
import ruPermits from './locales/ru/permits.json';
import ruRules from './locales/ru/rules.json';

/*
 * One file per feature (`locales/{lng}/{feature}.json`), merged under the feature name into
 * a single i18next namespace, so keys read `feature.component.element` (docs/06-frontend.md).
 * `pl` is complete; a key missing in `en`/`ru` falls back to `pl` until the localisation stage (T-31).
 */
export const resources = {
  pl: {
    translation: {
      common: plCommon,
      auth: plAuth,
      catalog: plCatalog,
      claims: plClaims,
      orgs: plOrgs,
      permits: plPermits,
      catches: plCatches,
      rules: plRules,
      legal: plLegal,
      errors: plErrors,
    },
  },
  en: {
    translation: {
      common: enCommon,
      auth: enAuth,
      catalog: enCatalog,
      claims: enClaims,
      orgs: enOrgs,
      permits: enPermits,
      catches: enCatches,
      rules: enRules,
      legal: enLegal,
      errors: enErrors,
    },
  },
  ru: {
    translation: {
      common: ruCommon,
      auth: ruAuth,
      catalog: ruCatalog,
      claims: ruClaims,
      orgs: ruOrgs,
      permits: ruPermits,
      catches: ruCatches,
      rules: ruRules,
      legal: ruLegal,
      errors: ruErrors,
    },
  },
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
