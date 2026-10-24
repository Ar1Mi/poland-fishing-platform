import { useTranslation } from 'react-i18next';

/** Template page linked from the registration consent (docs/07-security.md → RODO). */
export function PrivacyPolicyPage() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-h1">{t('legal.privacy.title')}</h1>
      <p className="max-w-prose text-body">{t('legal.privacy.template')}</p>
    </>
  );
}
