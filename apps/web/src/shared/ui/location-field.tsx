import { LoaderCircle, LocateFixed, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';

export interface Position {
  lat: number;
  lng: number;
}

type LocationState =
  { status: 'idle' | 'locating' | 'failed' } | { status: 'added'; position: Position };

/** About a metre: enough to show the place, no more of the user's position than needed. */
const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;

/** The phone's position, asked for only when the user presses the button. */
export function useCurrentPosition() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const locate = () => {
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setState({
          status: 'added',
          position: { lat: round(coords.latitude), lng: round(coords.longitude) },
        }),
      () => setState({ status: 'failed' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  const position = state.status === 'added' ? state.position : null;
  return { supported, state, position, locate, clear: () => setState({ status: 'idle' }) };
}

/** Texts of the feature: what the position is saved with. */
export interface LocationLabels {
  add: string;
  locating: string;
  added: string;
  remove: string;
  failed: string;
}

/** «Add my location» and what came of it; render only when `location.supported`. */
export function LocationField({
  location,
  labels,
}: {
  location: ReturnType<typeof useCurrentPosition>;
  labels: LocationLabels;
}) {
  const { state } = location;
  if (state.status === 'added') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1 text-small" role="status">
          <MapPin aria-hidden className="size-4 text-primary" />
          {labels.added}
        </p>
        <Button type="button" variant="ghost" onClick={location.clear}>
          <X aria-hidden />
          {labels.remove}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        disabled={state.status === 'locating'}
        onClick={location.locate}
      >
        {state.status === 'locating' ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <LocateFixed aria-hidden />
        )}
        {state.status === 'locating' ? labels.locating : labels.add}
      </Button>
      {state.status === 'failed' && (
        <p className="text-small text-muted-foreground" role="status">
          {labels.failed}
        </p>
      )}
    </div>
  );
}
