import type { ClaimStatus } from '@lowisko/shared';
import { CircleCheck, CircleX, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const { t } = useTranslation();
  if (status === 'APPROVED') {
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden />
        {t('claims.status.APPROVED')}
      </Badge>
    );
  }
  if (status === 'REJECTED') {
    return (
      <Badge variant="destructive">
        <CircleX aria-hidden />
        {t('claims.status.REJECTED')}
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <Clock aria-hidden />
      {t('claims.status.PENDING')}
    </Badge>
  );
}
