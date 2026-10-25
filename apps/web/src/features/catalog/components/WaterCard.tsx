import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatPrice } from '../../../shared/lib/format';
import type { WaterSummary } from '../api/useWaters';
import { WaterStatusBadge } from './WaterStatusBadge';

/** List entry linking to the water card; a connected water on sale shows its «od» price. */
export function WaterCard({
  water,
  lowestPriceGrosze,
}: {
  water: WaterSummary;
  lowestPriceGrosze?: number;
}) {
  const { t, i18n } = useTranslation();
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
        <div className="flex flex-wrap items-center gap-2">
          <WaterStatusBadge status={water.status} />
          {lowestPriceGrosze !== undefined && (
            <span className="font-mono text-small font-semibold">
              {t('catalog.card.priceFrom', {
                price: formatPrice(lowestPriceGrosze, i18n.resolvedLanguage ?? 'pl'),
              })}
            </span>
          )}
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
