import { ArrowLeft, CirclePause, ExternalLink, LoaderCircle, MapPinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { formatDate } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useWater, type WaterDetail } from '../api/useWaters';
import { WaterStatusBadge } from '../components/WaterStatusBadge';
import { safeExternalUrl } from '../lib/external-url';

/** Water card (FR-06, FR-23): who manages it and where to get a permit. */
export function WaterPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const water = useWater(id);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <Link
        to="/"
        onClick={(event) => {
          // Back to the map as it was left (filters, viewport) when we came from it.
          if (location.key !== 'default') {
            event.preventDefault();
            void navigate(-1);
          }
        }}
        className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary"
      >
        <ArrowLeft aria-hidden className="size-5" />
        {t('catalog.water.back')}
      </Link>
      {water.isPending && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('catalog.water.loading')}
        </Badge>
      )}
      {water.isError && <ApiErrorAlert error={water.error} />}
      {water.isSuccess && <WaterDetails water={water.data} />}
    </>
  );
}

function WaterDetails({ water }: { water: WaterDetail }) {
  const { t, i18n } = useTranslation();
  const connected = water.status === 'CONNECTED';
  // A blocked organization keeps its waters, but does not sell permits meanwhile.
  const suspended = connected && water.organization?.isActive === false;
  const ownerName = connected ? water.organization?.name : water.externalOwnerName;
  const externalUrl = connected ? null : safeExternalUrl(water.externalInfoUrl);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{water.name}</h1>
        <p className="text-muted-foreground">
          {t(`catalog.waterType.${water.type}`)} · {water.region}
        </p>
        {suspended ? (
          <Badge variant="warning">
            <CirclePause aria-hidden />
            {t('catalog.water.suspendedBadge')}
          </Badge>
        ) : (
          <WaterStatusBadge status={water.status} />
        )}
        {(water.lat === null || water.lng === null) && (
          <p className="flex items-center gap-1 text-small text-muted-foreground">
            <MapPinOff aria-hidden className="size-4" />
            {t('catalog.water.noPosition')}
          </p>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('catalog.water.permitsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-1">
            <dt className="caption text-muted-foreground">{t('catalog.water.owner')}</dt>
            <dd className="text-body font-semibold">
              {ownerName ?? t('catalog.water.ownerUnknown')}
            </dd>
          </dl>
          <p>
            {suspended
              ? t('catalog.water.permitsSuspended')
              : connected
                ? t('catalog.water.permitsConnected')
                : t('catalog.water.permitsExternal')}
          </p>
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 w-fit items-center gap-2 font-semibold text-primary underline"
            >
              {t('catalog.water.externalLink')}
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only">{t('catalog.water.externalLinkHint')}</span>
            </a>
          )}
        </CardContent>
      </Card>
      {water.description && (
        <Card>
          <CardHeader>
            <CardTitle>{t('catalog.water.description')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line">{water.description}</p>
          </CardContent>
        </Card>
      )}
      <p className="text-small text-muted-foreground">
        {t('catalog.water.source', {
          source: t(`catalog.source.${water.source}`),
          date: formatDate(water.updatedAt, i18n.resolvedLanguage ?? 'pl'),
        })}
      </p>
    </>
  );
}
