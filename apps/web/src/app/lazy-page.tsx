import { type ComponentType, lazy } from 'react';

const preloads: (() => Promise<unknown>)[] = [];

/**
 * A screen loaded with its own chunk on first render (T-29, a named export). Until the chunk
 * is there it suspends (`React.lazy`); the Suspense boundary is in AppLayout, around the
 * outlet. A chunk that fails to load (a new version deployed meanwhile, no network) reaches the
 * route's error page, whose button reloads the app. Once loaded — or preloaded — the screen
 * renders at once, without suspending.
 */
export function lazyPage<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
): ComponentType {
  let Screen: ComponentType | undefined;
  let loading: Promise<ComponentType> | undefined;
  const preload = () => (loading ??= load().then((module) => (Screen = module[name])));
  const Pending = lazy(async () => ({ default: await preload() }));
  preloads.push(preload);

  function LazyPage() {
    return Screen ? <Screen /> : <Pending />;
  }
  LazyPage.displayName = `Lazy(${name})`;
  return LazyPage;
}

/** Loads every lazy screen: component tests render them without a loading moment. */
export async function preloadAllPages(): Promise<void> {
  await Promise.all(preloads.map((preload) => preload()));
}
