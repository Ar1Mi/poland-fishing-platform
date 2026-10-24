import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/routes';
import { endSession, startSession } from '../shared/auth/session';

/**
 * Renders the real route tree at `path`, with a fresh query cache and no retries.
 * The session is settled: a guest, or logged in with `accessToken`.
 */
export function renderRoute(path: string, { accessToken }: { accessToken?: string } = {}) {
  if (accessToken) {
    startSession(accessToken);
  } else {
    endSession();
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Handler = (request: Request) => Response | Promise<Response>;

/**
 * Stubs `fetch` with handlers keyed by `METHOD /path`; an unexpected request fails the test.
 * Returns the mock, whose calls hold the sent Request objects.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const fetch = vi.fn(async (input: Request) => {
    const key = `${input.method} ${new URL(input.url).pathname}`;
    const handler = handlers[key];
    if (!handler) {
      throw new Error(`Unexpected request ${key}`);
    }
    return handler(input);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Requests sent to `METHOD /path`, with their JSON bodies. */
export async function sentBodies(
  fetch: ReturnType<typeof mockApi>,
  key: string,
): Promise<unknown[]> {
  const requests = fetch.mock.calls
    .map(([request]) => request)
    .filter((request) => `${request.method} ${new URL(request.url).pathname}` === key);
  return Promise.all(requests.map((request) => request.clone().json() as Promise<unknown>));
}

export const noContent = () => new Response(null, { status: 204 });
