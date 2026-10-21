import type { RouteObject } from 'react-router';
import { GuestOnly } from '../features/auth/components/GuestOnly';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage';
import { HomePage } from '../features/home/pages/HomePage';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage';
import { NotFoundPage } from '../shared/pages/NotFoundPage';
import { RouteErrorPage } from '../shared/pages/RouteErrorPage';
import { AppLayout } from './AppLayout';

// Screens are added by their feature tasks (docs/06-frontend.md → «Маршруты»).
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: 'register',
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      // Email links work in any state: the token, not the session, identifies the account.
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'privacy', element: <PrivacyPolicyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
