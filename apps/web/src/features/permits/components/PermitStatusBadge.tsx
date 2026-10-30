import type { EffectivePermitStatus } from '@lowisko/shared';
import {
  CalendarClock,
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../shared/ui/badge';

const LOOK: Record<
  EffectivePermitStatus,
  { variant: 'success' | 'neutral' | 'warning' | 'destructive'; Icon: LucideIcon }
> = {
  ACTIVE: { variant: 'success', Icon: CircleCheck },
  SCHEDULED: { variant: 'neutral', Icon: CalendarClock },
  PENDING_PAYMENT: { variant: 'warning', Icon: Clock },
  EXPIRED: { variant: 'neutral', Icon: CircleMinus },
  CANCELLED: { variant: 'destructive', Icon: CircleX },
  REVOKED: { variant: 'destructive', Icon: CircleX },
};

/** The computed status of a permit (ADR-0005): colour, icon and text. */
export function PermitStatusBadge({ status }: { status: EffectivePermitStatus }) {
  const { t } = useTranslation();
  const { variant, Icon } = LOOK[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {t(`permits.status.${status}`)}
    </Badge>
  );
}
