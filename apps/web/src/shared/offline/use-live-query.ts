import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * The result of an IndexedDB query, kept current as the device's data changes (Dexie
 * `liveQuery`); `undefined` until the first result for the current `key`. A failed query
 * (IndexedDB blocked) gives `null`, like no data.
 */
export function useLiveQuery<T>(query: () => Promise<T>, key: string): T | null | undefined {
  const [state, setState] = useState<{ key: string; value: T | null }>();
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (value) => setState({ key, value }),
      error: () => setState({ key, value: null }),
    });
    return () => subscription.unsubscribe();
    // The query is rebuilt every render; `key` names what it reads.
  }, [key]);
  return state?.key === key ? state.value : undefined;
}
