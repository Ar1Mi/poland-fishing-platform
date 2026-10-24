import type { WaterStatus } from '@lowisko/shared';
import { NotebookPen, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';

/** Connected waters sell permits online; the others only have the catch register. */
export function WaterStatusBadge({ status }: { status: WaterStatus }) {
  const { t } = useTranslation();
  return status === 'CONNECTED' ? (
    <Badge variant="success">
      <Ticket aria-hidden />
      {t('catalog.status.CONNECTED')}
    </Badge>
  ) : (
    <Badge variant="neutral">
      <NotebookPen aria-hidden />
      {t('catalog.status.UNCLAIMED')}
    </Badge>
  );
}
