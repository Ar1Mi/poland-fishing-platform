import type { RouteObject } from 'react-router';
import { GuestOnly } from '../features/auth/components/GuestOnly';
import { RequireAuth } from '../features/auth/components/RequireAuth';
import { CatalogPage } from '../features/catalog/pages/CatalogPage';
import { NotFoundPage } from '../shared/pages/NotFoundPage';
import { RouteErrorPage } from '../shared/pages/RouteErrorPage';
import { AppLayout } from './AppLayout';
import { lazyPage } from './lazy-page';

// Each screen is its own chunk (T-29): the first visit loads the catalogue, the rest on the way.
// The service worker precaches all chunks, so the offline screens open without network.
const AccountDeletedPage = lazyPage(
  () => import('../features/auth/pages/AccountDeletedPage'),
  'AccountDeletedPage',
);
const LoginPage = lazyPage(() => import('../features/auth/pages/LoginPage'), 'LoginPage');
const ProfilePage = lazyPage(() => import('../features/auth/pages/ProfilePage'), 'ProfilePage');
const RegisterPage = lazyPage(() => import('../features/auth/pages/RegisterPage'), 'RegisterPage');
const ResetPasswordPage = lazyPage(
  () => import('../features/auth/pages/ResetPasswordPage'),
  'ResetPasswordPage',
);
const VerifyEmailPage = lazyPage(
  () => import('../features/auth/pages/VerifyEmailPage'),
  'VerifyEmailPage',
);
const AdminWatersPage = lazyPage(
  () => import('../features/catalog/pages/AdminWatersPage'),
  'AdminWatersPage',
);
const OrgWaterPage = lazyPage(
  () => import('../features/catalog/pages/OrgWaterPage'),
  'OrgWaterPage',
);
const OrgWatersPage = lazyPage(
  () => import('../features/catalog/pages/OrgWatersPage'),
  'OrgWatersPage',
);
const SuggestWaterPage = lazyPage(
  () => import('../features/catalog/pages/SuggestWaterPage'),
  'SuggestWaterPage',
);
const MyCatchesPage = lazyPage(
  () => import('../features/catches/pages/MyCatchesPage'),
  'MyCatchesPage',
);
const NewCatchPage = lazyPage(
  () => import('../features/catches/pages/NewCatchPage'),
  'NewCatchPage',
);
const WaterPage = lazyPage(() => import('../features/catalog/pages/WaterPage'), 'WaterPage');
const OrgInspectionsPage = lazyPage(
  () => import('../features/inspections/pages/OrgInspectionsPage'),
  'OrgInspectionsPage',
);
const VerifyPage = lazyPage(() => import('../features/inspections/pages/VerifyPage'), 'VerifyPage');
const AdminClaimsPage = lazyPage(
  () => import('../features/claims/pages/AdminClaimsPage'),
  'AdminClaimsPage',
);
const OrgClaimsPage = lazyPage(
  () => import('../features/claims/pages/OrgClaimsPage'),
  'OrgClaimsPage',
);
const PrivacyPolicyPage = lazyPage(
  () => import('../features/legal/pages/PrivacyPolicyPage'),
  'PrivacyPolicyPage',
);
const AcceptInvitationPage = lazyPage(
  () => import('../features/orgs/pages/AcceptInvitationPage'),
  'AcceptInvitationPage',
);
const AdminOrganizationsPage = lazyPage(
  () => import('../features/orgs/pages/AdminOrganizationsPage'),
  'AdminOrganizationsPage',
);
const MyOrganizationsPage = lazyPage(
  () => import('../features/orgs/pages/MyOrganizationsPage'),
  'MyOrganizationsPage',
);
const OrgApplicationPage = lazyPage(
  () => import('../features/orgs/pages/OrgApplicationPage'),
  'OrgApplicationPage',
);
const OrgMembersPage = lazyPage(
  () => import('../features/orgs/pages/OrgMembersPage'),
  'OrgMembersPage',
);
const BuyPermitPage = lazyPage(
  () => import('../features/permits/pages/BuyPermitPage'),
  'BuyPermitPage',
);
const ExternalPermitPage = lazyPage(
  () => import('../features/permits/pages/ExternalPermitPage'),
  'ExternalPermitPage',
);
const ExternalPermitsPage = lazyPage(
  () => import('../features/permits/pages/ExternalPermitsPage'),
  'ExternalPermitsPage',
);
const FakePaymentPage = lazyPage(
  () => import('../features/permits/pages/FakePaymentPage'),
  'FakePaymentPage',
);
const MyPermitPage = lazyPage(
  () => import('../features/permits/pages/MyPermitPage'),
  'MyPermitPage',
);
const MyPermitsPage = lazyPage(
  () => import('../features/permits/pages/MyPermitsPage'),
  'MyPermitsPage',
);
const NewExternalPermitPage = lazyPage(
  () => import('../features/permits/pages/NewExternalPermitPage'),
  'NewExternalPermitPage',
);
const OrgPermitsPage = lazyPage(
  () => import('../features/permits/pages/OrgPermitsPage'),
  'OrgPermitsPage',
);
const OrgPermitTypesPage = lazyPage(
  () => import('../features/permits/pages/OrgPermitTypesPage'),
  'OrgPermitTypesPage',
);
const OrgRulesPage = lazyPage(() => import('../features/rules/pages/OrgRulesPage'), 'OrgRulesPage');
const PaymentReturnPage = lazyPage(
  () => import('../features/permits/pages/PaymentReturnPage'),
  'PaymentReturnPage',
);
const MyStatsPage = lazyPage(() => import('../features/reports/pages/MyStatsPage'), 'MyStatsPage');
const OrgStatsPage = lazyPage(
  () => import('../features/reports/pages/OrgStatsPage'),
  'OrgStatsPage',
);

// Screens are added by their feature tasks (docs/06-frontend.md → «Маршруты»).
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <CatalogPage /> },
      // Before `waters/:id`: a suggestion is sent by a logged-in angler (FR-25).
      {
        path: 'waters/suggest',
        element: (
          <RequireAuth>
            <SuggestWaterPage />
          </RequireAuth>
        ),
      },
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
      { path: 'account-deleted', element: <AccountDeletedPage /> },
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
      // Figures come from the server: online only.
      {
        path: 'me/stats',
        element: (
          <RequireAuth>
            <MyStatsPage />
          </RequireAuth>
        ),
      },
      // RODO export and deletion need the server: online only.
      {
        path: 'me/profile',
        element: (
          <RequireAuth>
            <ProfilePage />
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
        path: 'org/:orgId/stats',
        element: (
          <RequireAuth>
            <OrgStatsPage />
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
      {
        path: 'admin/waters',
        element: (
          <RequireAuth>
            <AdminWatersPage />
          </RequireAuth>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
