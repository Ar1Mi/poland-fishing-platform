import type { OrganizationStatus, OrgRole } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Test } from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createVerifiedUser, login } from './auth-helpers';
import { createOrganization } from './factories';

export interface OrgMember {
  userId: string;
  organizationId: string;
  accessToken: string;
}

/** A logged-in user holding `role` in a new organization (ACTIVE unless `status` says otherwise). */
export async function loginOrgMember(
  app: NestExpressApplication,
  prisma: PrismaClient,
  role: OrgRole,
  status: OrganizationStatus = 'ACTIVE',
): Promise<OrgMember> {
  const organization = await createOrganization(prisma, { status });
  const user = await createVerifiedUser(prisma);
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role },
  });
  const { accessToken } = await login(app, user.email);
  return { userId: user.id, organizationId: organization.id, accessToken };
}

/**
 * The check every `/orgs/:orgId/*` route needs (.claude/rules/testing.md): the ORG_ADMIN of
 * another ACTIVE organization gets 403 ORG_SCOPE_VIOLATION. `send` builds the request for the
 * victim's `orgId` with the attacker's token, e.g.
 * `(orgId, token) => request(server).get(`/api/v1/orgs/${orgId}/rules`).set('Authorization', `Bearer ${token}`)`.
 */
export async function expectForeignOrgAdminForbidden(
  app: NestExpressApplication,
  prisma: PrismaClient,
  send: (orgId: string, accessToken: string) => Test,
): Promise<void> {
  const victim = await createOrganization(prisma, { status: 'ACTIVE' });
  const attacker = await loginOrgMember(app, prisma, 'ORG_ADMIN');
  const response = await send(victim.id, attacker.accessToken);
  if (
    response.status !== 403 ||
    (response.body as { code?: string }).code !== 'ORG_SCOPE_VIOLATION'
  ) {
    throw new Error(
      `Admin of another organization was not rejected: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
}
