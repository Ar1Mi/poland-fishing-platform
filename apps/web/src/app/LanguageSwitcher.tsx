import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, isLocale } from '../shared/i18n/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t('common.language.label')}
      </label>
      <select
        id={id}
        value={i18n.resolvedLanguage}
        onChange={(event) => {
          if (isLocale(event.target.value)) {
            void i18n.changeLanguage(event.target.value);
          }
        }}
        className="h-11 rounded-md border border-primary-foreground/40 bg-primary-dark px-2 text-body text-primary-foreground focus-visible:outline-primary-foreground"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {t(`common.language.${locale}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
