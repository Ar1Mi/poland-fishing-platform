import { act, render, screen } from '@testing-library/react';
import { Component, type ReactNode, Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { lazyPage } from './lazy-page';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p>failed</p> : this.props.children;
  }
}

const Screen = () => <h1>Screen</h1>;

describe('lazyPage', () => {
  it('shows the fallback until the chunk is loaded, then the screen without loading again', async () => {
    let resolve!: (module: { Screen: typeof Screen }) => void;
    const load = vi.fn(() => new Promise<{ Screen: typeof Screen }>((done) => (resolve = done)));
    const Page = lazyPage(load, 'Screen');

    const first = render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    expect(screen.getByText('loading')).toBeVisible();
    act(() => resolve({ Screen }));
    expect(await screen.findByRole('heading', { name: 'Screen' })).toBeVisible();
    first.unmount();

    render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    expect(screen.getByRole('heading', { name: 'Screen' })).toBeVisible();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reaches the error boundary when the chunk fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Page = lazyPage(() => Promise.reject(new Error('offline')), 'Screen');

    render(
      <Boundary>
        <Suspense fallback={<p>loading</p>}>
          <Page />
        </Suspense>
      </Boundary>,
    );

    expect(await screen.findByText('failed')).toBeVisible();
  });
});
