import type { WaterPosition } from '@lowisko/shared';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { POLAND_BOUNDS, toLatLngBounds } from '../lib/map';
import { waterMarkerIcon } from './water-marker';

const icon = waterMarkerIcon(false);

/**
 * A map to point at the water (FR-25): a tap places the marker, which can then be dragged. The
 * coordinate fields next to it are the accessible way and show the same position.
 */
export function PositionPicker({
  value,
  onChange,
  label,
}: {
  value: WaterPosition | null;
  onChange: (position: WaterPosition) => void;
  label: string;
}) {
  return (
    <MapContainer
      bounds={toLatLngBounds(POLAND_BOUNDS)}
      className="h-72 w-full rounded-lg border border-border"
      aria-label={label}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        // The page sends no referrer (index.html); the OSM tile policy needs one: the origin is enough.
        referrerPolicy="origin"
        maxZoom={19}
      />
      <TapToPlace onChange={onChange} />
      {value && (
        <>
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as L.Marker).getLatLng();
                onChange({ lat, lng });
              },
            }}
          />
          <KeepInView position={value} />
        </>
      )}
    </MapContainer>
  );
}

function TapToPlace({ onChange }: { onChange: (position: WaterPosition) => void }) {
  useMapEvents({
    click: ({ latlng }) => onChange({ lat: latlng.lat, lng: latlng.lng }),
  });
  return null;
}

/** A position typed into the fields may be off the screen: the map moves to show it. */
function KeepInView({ position }: { position: WaterPosition }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains([position.lat, position.lng])) {
      map.panTo([position.lat, position.lng]);
    }
  }, [map, position]);
  return null;
}
