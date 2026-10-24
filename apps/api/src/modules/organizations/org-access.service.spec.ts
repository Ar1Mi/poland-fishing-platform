import type { PrismaService } from '../../database/prisma.service';
import type { UsersService } from '../users/users.service';
import { authenticatedUser, routeOrgId } from './guards/route-context';
import { OrgAccessService } from './org-access.service';

const ORG_ID = '6f1c1d2e-8b8a-4c55-9a52-3f0e1d6b7a90';

describe('OrgAccessService', () => {
  const findUnique = jest.fn();
  const service = new OrgAccessService(
    { organization: { findUnique } } as unknown as PrismaService,
    {} as UsersService,
  );

  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue({
      status: 'ACTIVE',
      memberships: [{ role: 'ORG_ADMIN' }],
    });
  });

  it('reads the membership once per request when both guards ask', async () => {
    const request = {};

    const first = await service.access(request, 'user-1', ORG_ID);
    const second = await service.access(request, 'user-1', ORG_ID);

    expect(first).toEqual({ organizationId: ORG_ID, status: 'ACTIVE', roles: ['ORG_ADMIN'] });
    expect(second).toBe(first);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('reads it again for the next request', async () => {
    await service.access({}, 'user-1', ORG_ID);
    await service.access({}, 'user-1', ORG_ID);

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('treats a non-UUID id as no access without querying', async () => {
    expect(await service.access({}, 'user-1', 'not-a-uuid')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('treats an organization without the user among its members as no access', async () => {
    findUnique.mockResolvedValue({ status: 'ACTIVE', memberships: [] });

    expect(await service.access({}, 'user-1', ORG_ID)).toBeNull();
  });
});

describe('organization guard route context', () => {
  it('fails loudly on a route without :orgId or without authentication', () => {
    expect(() => routeOrgId({ params: {} } as never)).toThrow(/:orgId/);
    expect(() => authenticatedUser({} as never)).toThrow(/without authentication/);
  });
});
