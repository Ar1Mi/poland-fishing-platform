import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useSpecies, useWaterRules } from '../api/useRules';
import { speciesName } from '../lib/format-rule';
import { RuleTerms } from './RuleTerms';

/**
 * Fishing rules of the water card (FR-16): per species the strictest of the general rules,
 * the regulamin of the organization and of the water — what the register checks catches against.
 */
export function WaterRules({ waterId }: { waterId: string }) {
  const { t, i18n } = useTranslation();
  const rules = useWaterRules(waterId);
  const species = useSpecies();
  const byId = new Map((species.data ?? []).map((item) => [item.id, item]));
  return (
    <Card aria-labelledby="water-rules-title">
      <CardHeader>
        <CardTitle id="water-rules-title">{t('rules.water.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {(rules.isPending || species.isPending) && !rules.isError && !species.isError && (
          <Badge variant="neutral" role="status">
            <LoaderCircle aria-hidden className="animate-spin" />
            {t('rules.water.loading')}
          </Badge>
        )}
        {rules.isError ? (
          <ApiErrorAlert error={rules.error} />
        ) : (
          species.isError && <ApiErrorAlert error={species.error} />
        )}
        {rules.isSuccess && species.isSuccess && (
          <>
            <p className="text-small text-muted-foreground">{t('rules.water.lead')}</p>
            {rules.data.length === 0 ? (
              <p className="text-body">{t('rules.water.empty')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {rules.data.map((rule) => {
                  const item = byId.get(rule.speciesId);
                  return (
                    <li key={rule.speciesId} className="flex flex-col gap-1 py-3 last:pb-0">
                      <p className="text-body font-semibold">
                        {item ? speciesName(item, i18n.resolvedLanguage) : ''}
                      </p>
                      {item?.isProtected && (
                        <Badge variant="destructive" className="w-fit">
                          <ShieldAlert aria-hidden />
                          {t('rules.water.protected')}
                        </Badge>
                      )}
                      <RuleTerms rule={rule} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
