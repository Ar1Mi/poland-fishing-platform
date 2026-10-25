/**
 * Leaves the app for `url` with a full page load (the payment gateway). A module of its own so
 * tests replace it: jsdom does not navigate.
 */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
