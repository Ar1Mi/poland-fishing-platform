import type { RouteObject } from 'react-router';
import { GuestOnly } from '../features/auth/components/GuestOnly';
import { RequireAuth } from '../features/auth/components/RequireAuth';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { OrgWaterPage } from '../features/catalog/pages/OrgWaterPage';
import { OrgWatersPage } from '../features/catalog/pages/OrgWatersPage';
import { MyCatchesPage } from '../features/catches/pages/MyCatchesPage';
import { NewCatchPage } from '../features/catches/pages/NewCatchPage';
import { WaterPage } from '../features/catalog/pages/WaterPage';
import { OrgInspectionsPage } from '../features/inspections/pages/OrgInspectionsPage';
import { VerifyPage } from '../features/inspections/pages/VerifyPage';
import { AdminClaimsPage } from '../features/claims/pages/AdminClaimsPage';
import { OrgClaimsPage } from '../features/claims/pages/OrgClaimsPage';
import { PrivacyPolicyPage } from '../features/legal/pages/PrivacyPolicyPage';
import { AcceptInvitationPage } from '../features/orgs/pages/AcceptInvitationPage';
import { AdminOrganizationsPage } from '../features/orgs/pages/AdminOrganizationsPage';
import { MyOrganizationsPage } from '../features/orgs/pages/MyOrganizationsPage';
import { OrgApplicationPage } from '../features/orgs/pages/OrgApplicationPage';
import { OrgMembersPage } from '../features/orgs/pages/OrgMembersPage';
import { BuyPermitPage } from '../features/permits/pages/BuyPermitPage';
import { ExternalPermitPage } from '../features/permits/pages/ExternalPermitPage';
import { ExternalPermitsPage } from '../features/permits/pages/ExternalPermitsPage';
import { FakePaymentPage } from '../features/permits/pages/FakePaymentPage';
import { MyPermitPage } from '../features/permits/pages/MyPermitPage';
import { MyPermitsPage } from '../features/permits/pages/MyPermitsPage';
import { NewExternalPermitPage } from '../features/permits/pages/NewExternalPermitPage';
import { OrgPermitsPage } from '../features/permits/pages/OrgPermitsPage';
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
      // The angler's pages that work without network, from what the device holds (ADR-0009).
      {
        path: 'me/permits',
        element: (
          <RequireAuth offline>
            <MyPermitsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/permits/:id',
        element: (
          <RequireAuth offline>
            <MyPermitPage />
          </RequireAuth>
        ),
      },
      {
        path: 'catch/new',
        element: (
          <RequireAuth offline>
            <NewCatchPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/catches',
        element: (
          <RequireAuth offline>
            <MyCatchesPage />
          </RequireAuth>
        ),
      },
      // External permits are typed in online; the catch form uses them from the device.
      {
        path: 'me/external-permits',
        element: (
          <RequireAuth>
            <ExternalPermitsPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/external-permits/new',
        element: (
          <RequireAuth>
            <NewExternalPermitPage />
          </RequireAuth>
        ),
      },
      {
        path: 'me/external-permits/:id',
        element: (
          <RequireAuth>
            <ExternalPermitPage />
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
        path: 'org/new',
        element: (
          <RequireAuth>
            <OrgApplicationPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/members',
        element: (
          <RequireAuth>
            <OrgMembersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/waters',
        element: (
          <RequireAuth>
            <OrgWatersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/waters/:waterId',
        element: (
          <RequireAuth>
            <OrgWaterPage />
          </RequireAuth>
        ),
      },
      {
        path: 'org/:orgId/permits',
        element: (
          <RequireAuth>
            <OrgPermitsPage />
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
        path: 'admin/orgs',
        element: (
          <RequireAuth>
            <AdminOrganizationsPage />
          </RequireAuth>
        ),
      },
      // The link of the invitation email: the API checks that the account is the invited one.
      {
        path: 'invitations/accept',
        element: (
          <RequireAuth>
            <AcceptInvitationPage />
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
