import {
  DISCOUNT_AGE,
  latestPermitStart,
  permitStartFormSchema,
  permitValidTo,
  purchasePermitSchema,
  warsawDate,
} from '@lowisko/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Info, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { formatDate, formatPrice } from '../../../shared/lib/format';
import { redirectTo } from '../../../shared/lib/redirect';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { TextField } from '../../../shared/ui/form-field';
import { useWater, type WaterDetail } from '../../catalog/api/useWaters';
import { type PermitType, useWaterPermitTypes } from '../api/usePermitTypes';
import { usePurchasePermit } from '../api/usePurchase';
import { PermitTypeTerms } from '../components/PermitTypeTerms';

/**
 * `/buy/:permitTypeId?waterId=` (FR-08, scenario A): the start date, then the payment page.
 * The type is looked up in the offer of the water the buyer came from.
 */
export function BuyPermitPage() {
  const { t } = useTranslation();
  const { permitTypeId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const waterId = searchParams.get('waterId') ?? '';
  const water = useWater(waterId, { enabled: waterId !== '' });
  const types = useWaterPermitTypes(waterId, { enabled: waterId !== '' });

  if (waterId === '') {
    return <Unavailable />;
  }
  if (water.isError || types.isError) {
    return <ApiErrorAlert error={water.error ?? types.error} />;
  }
  if (water.isPending || types.isPending) {
    return (
      <Badge variant="neutral" role="status">
        <LoaderCircle aria-hidden className="animate-spin" />
        {t('permits.buy.loading')}
      </Badge>
    );
  }
  const type = types.data.find((offered) => offered.id === permitTypeId);
  return type ? <PurchaseForm type={type} water={water.data} /> : <Unavailable waterId={waterId} />;
}

/** Sold out, taken off sale, or a link without its water. */
function Unavailable({ waterId }: { waterId?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-h1">{t('permits.buy.title')}</h1>
      <Alert variant="warning" role="alert">
        <Info aria-hidden />
        <AlertDescription className="text-body">{t('permits.buy.unavailable')}</AlertDescription>
      </Alert>
      <BackLink to={waterId ? `/waters/${waterId}` : '/'}>
        {waterId ? t('permits.buy.backToWater') : t('permits.buy.backToCatalog')}
      </BackLink>
    </>
  );
}

function PurchaseForm({ type, water }: { type: PermitType; water: WaterDetail }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  // Fixed for the life of the page, so the form does not change under the buyer at midnight.
  const [today] = useState(() => warsawDate(new Date()));
  const latest = latestPermitStart(today);
  const purchase = usePurchasePermit();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<{ validFrom: string }>({
    resolver: zodResolver(permitStartFormSchema(today)),
    defaultValues: { validFrom: today },
  });

  const validFrom = watch('validFrom');
  const datesKnown = purchasePermitSchema.shape.validFrom.safeParse(validFrom).success;
  const free = type.priceGrosze === 0;
  const issue = errors.validFrom?.message;

  const onSubmit = ({ validFrom }: { validFrom: string }) => {
    purchase.mutate(
      { permitTypeId: type.id, validFrom },
      // A full page load: the payment page is the gateway's, not ours.
      { onSuccess: ({ paymentUrl }) => redirectTo(paymentUrl) },
    );
  };

  return (
    <>
      <BackLink to={`/waters/${water.id}`}>{t('permits.buy.backToWater')}</BackLink>
      <h1 className="text-h1">{t('permits.buy.title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{type.name}</CardTitle>
          <p className="text-small text-muted-foreground">
            <PermitTypeTerms type={type} />
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="caption text-muted-foreground">{t('permits.buy.water')}</dt>
            <dd className="text-body font-semibold">{water.name}</dd>
            <dt className="caption text-muted-foreground">
              {t('permits.payment.return.organization')}
            </dt>
            <dd className="text-body">{water.organization?.name}</dd>
            <dt className="caption text-muted-foreground">{t('permits.buy.price')}</dt>
            <dd className="font-mono text-body font-semibold">
              {formatPrice(type.priceGrosze, locale)}
            </dd>
          </dl>
          {type.discountKind !== 'NONE' && (
            <Alert>
              <Info aria-hidden />
              <AlertDescription className="text-body">
                {t(`permits.buy.discount.${type.discountKind}`, {
                  age:
                    type.discountKind === 'JUNIOR'
                      ? DISCOUNT_AGE.JUNIOR_BELOW
                      : DISCOUNT_AGE.SENIOR_FROM,
                })}
              </AlertDescription>
            </Alert>
          )}
          <form
            noValidate
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-4"
          >
            <TextField
              type="date"
              label={t('permits.buy.validFrom.label')}
              hint={t('permits.buy.validFrom.hint', { latest: formatDate(latest, locale) })}
              min={today}
              max={latest}
              error={
                issue === 'IN_PAST'
                  ? t('permits.buy.validFrom.errorPast')
                  : issue === 'TOO_LATE'
                    ? t('permits.buy.validFrom.errorTooLate', {
                        latest: formatDate(latest, locale),
                      })
                    : issue && t('permits.buy.validFrom.errorInvalid')
              }
              {...register('validFrom')}
            />
            {datesKnown && (
              <p className="text-body">
                {t('permits.validity', {
                  from: formatDate(validFrom, locale),
                  to: formatDate(permitValidTo(validFrom, type.durationDays), locale),
                })}
              </p>
            )}
            {!free && (
              <p className="text-small text-muted-foreground">{t('permits.buy.paymentNote')}</p>
            )}
            {purchase.isError && <ApiErrorAlert error={purchase.error} />}
            <Button
              type="submit"
              variant="accent"
              // Stays disabled while the browser leaves for the payment page.
              disabled={purchase.isPending || purchase.isSuccess}
            >
              {(purchase.isPending || purchase.isSuccess) && (
                <LoaderCircle aria-hidden className="animate-spin" />
              )}
              {free ? t('permits.buy.submitFree') : t('permits.buy.submitPaid')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary">
      <ArrowLeft aria-hidden className="size-5" />
      {children}
    </Link>
  );
}
