import { type PurchasePermitInput } from '@lowisko/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, request } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';

export type MyPermit = components['schemas']['MyPermitDto'];
export type FakePaymentOutcome = components['schemas']['CompleteFakePaymentDto']['outcome'];

/** Scenario A: the return page asks every 2 s, for up to 60 s (docs/09-scenarios.md). */
export const PAYMENT_POLL_INTERVAL_MS = 2000;
export const PAYMENT_POLL_WINDOW_MS = 60_000;

export function usePurchasePermit() {
  return useMutation({
    mutationFn: (body: PurchasePermitInput) => request(() => api.POST('/api/v1/permits', { body })),
  });
}

/**
 * The permit, asked again while its payment waits for confirmation and less than
 * PAYMENT_POLL_WINDOW_MS has passed since `pollingSince` (a `Date.now()` value).
 */
export function useMyPermitPolling(id: string, pollingSince: number) {
  return useQuery({
    queryKey: ['me', 'permits', id],
    queryFn: ({ signal }) =>
      request(() => api.GET('/api/v1/me/permits/{id}', { params: { path: { id } }, signal })),
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING_PAYMENT' &&
      Date.now() - pollingSince < PAYMENT_POLL_WINDOW_MS
        ? PAYMENT_POLL_INTERVAL_MS
        : false,
  });
}

/** «Zapłać» / «Odrzuć» on the fake payment page (PAYMENTS_PROVIDER=fake). */
export function useCompleteFakePayment(sessionId: string) {
  return useMutation({
    mutationFn: (outcome: FakePaymentOutcome) =>
      request(() =>
        api.POST('/api/v1/payments/fake/{sessionId}/complete', {
          params: { path: { sessionId } },
          body: { outcome },
        }),
      ),
  });
}
