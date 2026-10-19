import 'i18next';
import type { resources } from './i18n';

// Keys are checked by the compiler against the complete Polish resources.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['pl'];
  }
}
