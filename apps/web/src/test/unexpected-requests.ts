// Kept apart from render.tsx: setup.ts imports this file, and importing the route tree there
// would load the real modules before the test files' `vi.mock` can replace them.

/** `METHOD /path` of requests no `mockApi` handler answered, since the last take. */
const unexpectedRequests: string[] = [];

export function recordUnexpectedRequest(key: string): void {
  unexpectedRequests.push(key);
}

/** The unexpected requests recorded so far; the list starts over. */
export function takeUnexpectedRequests(): string[] {
  return unexpectedRequests.splice(0);
}
