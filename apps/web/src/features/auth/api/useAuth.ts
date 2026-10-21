import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from '@lowisko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { api, request } from '../../../shared/api/client';
import {
  endSession,
  getSessionStatus,
  startSession,
  subscribeSession,
} from '../../../shared/auth/session';

export const meQueryKey = ['me'] as const;

export function useSessionStatus() {
  return useSyncExternalStore(subscribeSession, getSessionStatus);
}

/** Profile of the logged-in user; idle for guests. */
export function useMe() {
  const status = useSessionStatus();
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => request(() => api.GET('/api/v1/me', { signal })),
    enabled: status === 'authenticated',
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginInput) => request(() => api.POST('/api/v1/auth/login', { body })),
    onSuccess: ({ accessToken }) => {
      queryClient.removeQueries({ queryKey: meQueryKey });
      startSession(accessToken);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request(() => api.POST('/api/v1/auth/logout')),
    // Even if the API is unreachable, this tab forgets the session and every cached answer
    // that belonged to the user.
    onSettled: () => {
      endSession();
      queryClient.clear();
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterInput) => request(() => api.POST('/api/v1/auth/register', { body })),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      request(() => api.POST('/api/v1/auth/verify-email', { body: { token } })),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordInput) =>
      request(() => api.POST('/api/v1/auth/forgot-password', { body })),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordInput) =>
      request(() => api.POST('/api/v1/auth/reset-password', { body })),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => request(() => api.PATCH('/api/v1/me', { body })),
    onSuccess: (profile) => {
      queryClient.setQueryData(meQueryKey, profile);
    },
  });
}

/** After login the interface follows the language saved in the profile (docs/06-frontend.md). */
export function useProfileLocale() {
  const { i18n } = useTranslation();
  const locale = useMe().data?.locale;
  useEffect(() => {
    if (locale && locale !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(locale);
    }
  }, [locale, i18n]);
}
