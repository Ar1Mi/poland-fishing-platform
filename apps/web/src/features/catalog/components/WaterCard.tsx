import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { WaterSummary } from '../api/useWaters';
import { WaterStatusBadge } from './WaterStatusBadge';

/**
 * List entry linking to the water card. The «od» price of connected waters comes with
 * permit types (T-12).
 */
export function WaterCard({ water }: { water: WaterSummary }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/waters/${water.id}`}
      className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary/40"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-semibold">{water.name}</span>
        <span className="text-small text-muted-foreground">
          {t(`catalog.waterType.${water.type}`)} · {water.region}
        </span>
        <WaterStatusBadge status={water.status} />
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
