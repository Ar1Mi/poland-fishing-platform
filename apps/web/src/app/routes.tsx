import type { RouteObject } from 'react-router';
import { GuestOnly } from '../features/auth/components/GuestOnly';
import { RequireAuth } from '../features/auth/components/RequireAuth';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { WaterPage } from '../features/catalog/pages/WaterPage';
import { AdminClaimsPage } from '../features/claims/pages/AdminClaimsPage';
import { OrgClaimsPage } from '../features/claims/pages/OrgClaimsPage';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage';
import { MyOrganizationsPage } from '../features/orgs/pages/MyOrganizationsPage';
import { NotFoundPage } from '../shared/pages/NotFoundPage';
import { RouteErrorPage } from '../shared/pages/RouteErrorPage';
import { AppLayout } from './AppLayout';

// Screens are added by their feature tasks (docs/06-frontend.md → «Маршруты»).
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'waters/:id', element: <WaterPage /> },
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
      // Access is decided by the API; the client only sends guests to the login page.
      {
        path: 'org',
        element: (
          <RequireAuth>
            <MyOrganizationsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/claims',
        element: (
          <RequireAuth>
            <OrgClaimsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin/claims',
        element: (
          <RequireAuth>
            <AdminClaimsPage />
          </RequireAuth>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
