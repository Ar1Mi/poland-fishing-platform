import { useTranslation } from 'react-i18next';
import type { PermitType } from '../api/usePermitTypes';

/** «7 dni · Ulgowe — młodzież»: how long a type is valid and its discount, if any. */
export function PermitTypeTerms({
  type,
}: {
  type: Pick<PermitType, 'durationDays' | 'discountKind'>;
}) {
  const { t } = useTranslation();
  const duration = t('permits.terms.duration', { count: type.durationDays });
  return (
    <>
      {type.discountKind === 'NONE'
        ? duration
        : `${duration} · ${t(`permits.discount.${type.discountKind}`)}`}
    </>
  );
}
