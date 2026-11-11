import L from 'leaflet';

/**
 * Marker of a water on the map: a filled dot for a connected water, a ring for one with only
 * the register (`.water-marker` in `index.css`), so the status is not told by colour alone.
 */
export const waterMarkerIcon = (connected: boolean) =>
  L.divIcon({
    className: '',
    html: `<span class="water-marker${connected ? ' water-marker--connected' : ''}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
