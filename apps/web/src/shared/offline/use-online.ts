import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  globalThis.addEventListener('online', listener);
  globalThis.addEventListener('offline', listener);
  return () => {
    globalThis.removeEventListener('online', listener);
    globalThis.removeEventListener('offline', listener);
  };
}

/** Whether the browser has a network (`navigator.onLine`): false is certain, true is a hope. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}
