import type { RouteObject } from 'react-router';
import { GuestOnly } from '../features/auth/components/GuestOnly';
import { RequireAuth } from '../features/auth/components/RequireAuth';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { MyCatchesPage } from '../features/catches/pages/MyCatchesPage';
import { NewCatchPage } from '../features/catches/pages/NewCatchPage';
import { WaterPage } from '../features/catalog/pages/WaterPage';
import { OrgInspectionsPage } from '../features/inspections/pages/OrgInspectionsPage';
import { VerifyPage } from '../features/inspections/pages/VerifyPage';
import { AdminClaimsPage } from '../features/claims/pages/AdminClaimsPage';
import { OrgClaimsPage } from '../features/claims/pages/OrgClaimsPage';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage';
import { MyOrganizationsPage } from '../features/orgs/pages/MyOrganizationsPage';
import { BuyPermitPage } from '../features/permits/pages/BuyPermitPage';
import { FakePaymentPage } from '../features/permits/pages/FakePaymentPage';
import { MyPermitPage } from '../features/permits/pages/MyPermitPage';
import { MyPermitsPage } from '../features/permits/pages/MyPermitsPage';
import { OrgPermitTypesPage } from '../features/permits/pages/OrgPermitTypesPage';
import { OrgRulesPage } from '../features/rules/pages/OrgRulesPage';
import { PaymentReturnPage } from '../features/permits/pages/PaymentReturnPage';
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
      // The phone camera opens it from the QR code: public, an inspector's session shows more.
      { path: 'verify/:token', element: <VerifyPage /> },
      // Access is decided by the API; the client only sends guests to the login page.
      {
        path: 'buy/:permitTypeId',
        element: (
          <RequireAuth>
            <BuyPermitPage />
          </RequireAuth>
        ),
      },
      {
        path: 'payment/return',
        element: (
          <RequireAuth>
            <PaymentReturnPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/permits',
        element: (
          <RequireAuth>
            <MyPermitsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/permits/:id',
        element: (
          <RequireAuth>
            <MyPermitPage />
          </RequireAuth>
        ),
      },
      {
        path: 'catch/new',
        element: (
          <RequireAuth>
            <NewCatchPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/catches',
        element: (
          <RequireAuth>
            <MyCatchesPage />
          </RequireAuth>
        ),
      },
      // The gateway's page in development (PAYMENTS_PROVIDER=fake); P24 needs no login either.
      { path: 'payment/fake/:sessionId', element: <FakePaymentPage /> },
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
        path: 'org/:orgId/permit-types',
        element: (
          <RequireAuth>
            <OrgPermitTypesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/rules',
        element: (
          <RequireAuth>
            <OrgRulesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/inspections',
        element: (
          <RequireAuth>
            <OrgInspectionsPage />
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
