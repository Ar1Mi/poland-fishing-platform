import L, { type MarkerCluster } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import { Link } from 'react-router';
import type { WaterSummary } from '../api/useWaters';
import { bboxOf, POLAND_BOUNDS, toLatLngBounds, withPosition } from '../lib/map';
import { TILES } from '../lib/tiles';
import { waterMarkerIcon } from './water-marker';
import { WaterStatusBadge } from './WaterStatusBadge';

interface WatersMapProps {
  waters: WaterSummary[];
  /** Called with `minLng,minLat,maxLng,maxLat` when the map is laid out and after each move. */
  onBoundsChange: (bbox: string) => void;
  /** Zoom to the given waters (after a name search, once its results have arrived). */
  fitToWaters: boolean;
}

// Shape and fill differ by status, not only colour (docs/10-design-system.md); the popup says it in text.
const connectedIcon = waterMarkerIcon(true);
const unclaimedIcon = waterMarkerIcon(false);

/** Catalogue map with tiles (`TILES`) and marker clusters; the list under it is the accessible view. */
export function WatersMap({ waters, onBoundsChange, fitToWaters }: WatersMapProps) {
  const { t } = useTranslation();
  const positioned = useMemo(() => withPosition(waters), [waters]);
  const clusterIcon = (cluster: MarkerCluster) => {
    const count = cluster.getChildCount();
    // Built as an element, so a translation with quotes cannot break out of the attribute.
    const icon = document.createElement('span');
    icon.className = 'water-cluster';
    icon.setAttribute('aria-label', t('catalog.map.cluster', { count }));
    icon.textContent = String(count);
    return L.divIcon({ className: '', html: icon, iconSize: [44, 44] });
  };

  return (
    <MapContainer
      bounds={toLatLngBounds(POLAND_BOUNDS)}
      className="h-[50dvh] min-h-72 w-full rounded-lg border border-border"
      aria-label={t('catalog.map.label')}
    >
      <TileLayer
        attribution={TILES.attribution}
        url={TILES.url}
        // The page sends no referrer (index.html); the OSM tile policy needs one, and a MapTiler key
        // is restricted to the allowed origins: the origin is enough.
        referrerPolicy="origin"
        maxZoom={19}
      />
      <BoundsReporter onBoundsChange={onBoundsChange} />
      {fitToWaters && <FitToWaters waters={positioned} />}
      <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
        {positioned.map((water) => (
          <Marker
            key={water.id}
            position={[water.lat, water.lng]}
            icon={water.status === 'CONNECTED' ? connectedIcon : unclaimedIcon}
            title={water.name}
            alt={water.name}
          >
            <Popup>
              <div className="flex flex-col gap-2">
                <span className="text-body font-semibold">{water.name}</span>
                <span className="text-small text-muted-foreground">
                  {t(`catalog.waterType.${water.type}`)}
                </span>
                <WaterStatusBadge status={water.status} />
                <Link to={`/waters/${water.id}`} className="text-body font-semibold text-primary">
                  {t('catalog.map.details')}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

function BoundsReporter({ onBoundsChange }: { onBoundsChange: (bbox: string) => void }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(bboxOf(map.getBounds())),
  });
  // The bounds once laid out; later changes come from moveend. A stable callback (a state
  // setter) keeps this to a single call.
  useEffect(() => {
    onBoundsChange(bboxOf(map.getBounds()));
  }, [map, onBoundsChange]);
  return null;
}

function FitToWaters({ waters }: { waters: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (waters.length > 0) {
      map.fitBounds(
        waters.map((water) => [water.lat, water.lng]),
        { maxZoom: 12, padding: [24, 24] },
      );
    }
  }, [map, waters]);
  return null;
}
