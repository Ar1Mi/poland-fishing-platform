import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAIM_PROOF_MAX_BYTES } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createClaim, createOrganization, createWater } from './factories';
import { expectForeignOrgAdminForbidden, loginOrgMember, type OrgMember } from './org-helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
  'base64',
);
const UPLOADS_DIR = process.env.UPLOADS_DIR!;
// `expect.any()` is typed as `any`; narrowing it keeps the assertions type-checked.
const anyString: unknown = expect.any(String);

interface Claim {
  id: string;
  status: string;
  water: { id: string; name: string; region: string; status: string };
  comment: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

describe('water claims', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let admin: OrgMember;
  let superAdminId: string;
  let superAdminToken: string;

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const submit = (
    fishingWaterId: string,
    file: Buffer | null = PDF,
    member: Pick<OrgMember, 'organizationId' | 'accessToken'> = admin,
  ) => {
    const req = request(server())
      .post(`/api/v1/orgs/${member.organizationId}/claims`)
      .set(bearer(member.accessToken))
      .field('fishingWaterId', fishingWaterId);
    // The declared name and type lie on purpose: only the content counts.
    return file
      ? req.attach('file', file, { filename: 'umowa.pdf', contentType: 'application/pdf' })
      : req;
  };

  const review = (id: string, body: object, token = superAdminToken) =>
    request(server()).patch(`/api/v1/admin/claims/${id}`).set(bearer(token)).send(body);

  const storedFiles = async () => readdir(join(UPLOADS_DIR, 'claims')).catch(() => []);

  /** Code (and `details.status`, if any) of the 409 among two concurrent answers. */
  const loserOutcome = (responses: request.Response[]) => {
    const body = responses.find((response) => response.status === 409)?.body as
      { code: string; details?: { status?: string } } | undefined;
    return body?.details?.status
      ? { code: body.code, status: body.details.status }
      : { code: body?.code };
  };

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
    admin = await loginOrgMember(app, prisma, 'ORG_ADMIN');
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    superAdminId = superAdmin.id;
    ({ accessToken: superAdminToken } = await login(app, superAdmin.email));
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  describe('POST /orgs/:orgId/claims', () => {
    it('creates a PENDING claim and stores the document under a random name', async () => {
      const water = await createWater(prisma, { name: 'Jezioro Białe' });

      const response = await submit(water.id).expect(201);

      expect(response.body).toEqual({
        id: anyString,
        status: 'PENDING',
        water: { id: water.id, name: 'Jezioro Białe', region: 'mazowieckie', status: 'UNCLAIMED' },
        comment: null,
        createdAt: anyString,
        reviewedAt: null,
      });
      const claim = await prisma.waterClaim.findUniqueOrThrow({
        where: { id: (response.body as Claim).id },
      });
      expect(claim).toMatchObject({ organizationId: admin.organizationId, status: 'PENDING' });
      expect(claim.proofFileKey).toMatch(/^claims\/[0-9a-f-]{36}\.pdf$/);
      expect(await readFile(join(UPLOADS_DIR, claim.proofFileKey))).toEqual(PDF);
    });

    it('stores an image with the extension of its real type', async () => {
      const water = await createWater(prisma);

      const response = await submit(water.id, PNG).expect(201);

      const claim = await prisma.waterClaim.findUniqueOrThrow({
        where: { id: (response.body as Claim).id },
      });
      expect(claim.proofFileKey).toMatch(/\.png$/);
    });

    it('rejects a text file sent as a PDF and keeps nothing', async () => {
      const water = await createWater(prisma);
      const before = await storedFiles();

      const response = await submit(water.id, Buffer.from('not really a pdf')).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { file: [anyString] } },
      });
      expect(await storedFiles()).toEqual(before);
      expect(await prisma.waterClaim.count()).toBe(0);
    });

    it('requires the document', async () => {
      const water = await createWater(prisma);

      const response = await submit(water.id, null).expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { file: ['file is required'] } },
      });
    });

    it('refuses a document over 5 MB with 413', async () => {
      const water = await createWater(prisma);
      const big = Buffer.concat([PDF, Buffer.alloc(CLAIM_PROOF_MAX_BYTES)]);

      const response = await submit(water.id, big).expect(413);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('validates fishingWaterId', async () => {
      const response = await submit('not-a-uuid').expect(400);

      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { fishingWaterId: [anyString] } },
      });
    });

    it.each([
      ['an unknown water', () => Promise.resolve('00000000-0000-4000-8000-000000000000')],
      [
        'an unpublished suggestion',
        async () => (await createWater(prisma, { isPublished: false })).id,
      ],
    ])('answers 404 for %s', async (_case, waterId) => {
      const response = await submit(await waterId()).expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('refuses a water that is already connected', async () => {
      const owner = await createOrganization(prisma, { status: 'ACTIVE' });
      const water = await createWater(prisma, { status: 'CONNECTED', organizationId: owner.id });

      const response = await submit(water.id).expect(409);

      expect(response.body).toMatchObject({ code: 'WATER_ALREADY_CONNECTED' });
    });

    it('refuses a second pending claim of the same water by the organization', async () => {
      const water = await createWater(prisma);
      await submit(water.id).expect(201);
      const before = await storedFiles();

      const response = await submit(water.id).expect(409);

      expect(response.body).toMatchObject({ code: 'CLAIM_ALREADY_PENDING' });
      expect(await storedFiles()).toEqual(before);
    });

    it('accepts one of two simultaneous claims and removes the document of the other', async () => {
      const water = await createWater(prisma);
      const before = (await storedFiles()).length;

      const responses = await Promise.all([submit(water.id), submit(water.id)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
        code: 'CLAIM_ALREADY_PENDING',
      });
      expect(await prisma.waterClaim.count()).toBe(1);
      expect((await storedFiles()).length).toBe(before + 1);
    });

    it('never leaves a claim pending on a water approved for another organization at the same time', async () => {
      const rival = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      // A race: repeated so both orders (submission first, approval first) are likely to occur.
      for (let round = 0; round < 5; round++) {
        const water = await createWater(prisma);
        const approved = await createClaim(prisma, { fishingWaterId: water.id });

        const [submitted, approval] = await Promise.all([
          submit(water.id, PDF, rival),
          review(approved.id, { decision: 'APPROVE' }),
        ]);

        expect(approval.status).toBe(200);
        if (submitted.status === 201) {
          const claim = await prisma.waterClaim.findUniqueOrThrow({
            where: { id: (submitted.body as Claim).id },
          });
          expect(claim.status).toBe('REJECTED');
        } else {
          expect(submitted.status).toBe(409);
          expect(submitted.body).toMatchObject({ code: 'WATER_ALREADY_CONNECTED' });
        }
      }
      expect(await prisma.waterClaim.count({ where: { status: 'PENDING' } })).toBe(0);
    });

    it('lets another organization claim the same water', async () => {
      const water = await createWater(prisma);
      const other = await loginOrgMember(app, prisma, 'ORG_ADMIN');
      await submit(water.id).expect(201);

      await submit(water.id, PDF, other).expect(201);
    });

    it('is only for the ORG_ADMIN of the organization', async () => {
      const water = await createWater(prisma);
      const inspector = await loginOrgMember(app, prisma, 'INSPECTOR');

      const response = await submit(water.id, PDF, inspector).expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        submit(water.id, PDF, { organizationId: orgId, accessToken: token }),
      );
    });

    it('is closed to an organization that is not active yet', async () => {
      const water = await createWater(prisma);
      const pending = await loginOrgMember(app, prisma, 'ORG_ADMIN', 'PENDING');

      const response = await submit(water.id, PDF, pending).expect(403);

      expect(response.body).toMatchObject({ code: 'ORG_NOT_ACTIVE' });
    });
  });

  describe('GET /orgs/:orgId/claims', () => {
    it('lists only the claims of the organization, newest first', async () => {
      const older = await createClaim(prisma, {
        organizationId: admin.organizationId,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      const newer = await createClaim(prisma, {
        organizationId: admin.organizationId,
        status: 'REJECTED',
        comment: 'Brak umowy dzierżawy',
        createdAt: new Date('2026-10-02T10:00:00.000Z'),
      });
      await createClaim(prisma);

      const response = await request(server())
        .get(`/api/v1/orgs/${admin.organizationId}/claims`)
        .set(bearer(admin.accessToken))
        .expect(200);

      const claims = response.body as Claim[];
      expect(claims.map((claim) => claim.id)).toEqual([newer.id, older.id]);
      expect(claims[0]).toMatchObject({ status: 'REJECTED', comment: 'Brak umowy dzierżawy' });
    });

    it('is closed to the admin of another organization', async () => {
      await expectForeignOrgAdminForbidden(app, prisma, (orgId, token) =>
        request(server()).get(`/api/v1/orgs/${orgId}/claims`).set(bearer(token)),
      );
    });
  });

  describe('GET /admin/claims', () => {
    it('lists claims oldest first with the organization and the document type', async () => {
      const organization = await createOrganization(prisma, { status: 'ACTIVE', name: 'Koło 12' });
      const first = await createClaim(prisma, {
        organizationId: organization.id,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      const second = await createClaim(prisma, {
        proofFileKey: 'claims/00000000-0000-4000-8000-000000000001.jpg',
        createdAt: new Date('2026-10-02T10:00:00.000Z'),
      });
      await createClaim(prisma, { status: 'APPROVED' });

      const response = await request(server())
        .get('/api/v1/admin/claims?status=PENDING')
        .set(bearer(superAdminToken))
        .expect(200);

      const claims = response.body as (Claim & { organization: object; documentType: string })[];
      expect(claims.map((claim) => claim.id)).toEqual([first.id, second.id]);
      expect(claims[0]).toMatchObject({
        organization: {
          id: organization.id,
          name: 'Koło 12',
          nip: organization.nip,
          status: 'ACTIVE',
        },
        documentType: 'application/pdf',
      });
      expect(claims[1]?.documentType).toBe('image/jpeg');
    });

    it('is only for the super admin', async () => {
      const response = await request(server())
        .get('/api/v1/admin/claims')
        .set(bearer(admin.accessToken))
        .expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('PATCH /admin/claims/:id', () => {
    it('approves: the water becomes CONNECTED to the organization, other pending claims are rejected', async () => {
      const water = await createWater(prisma);
      const claim = await createClaim(prisma, {
        fishingWaterId: water.id,
        organizationId: admin.organizationId,
      });
      const rival = await createClaim(prisma, { fishingWaterId: water.id });
      const unrelated = await createClaim(prisma);

      const response = await review(claim.id, { decision: 'APPROVE' }).expect(200);

      expect(response.body).toMatchObject({
        id: claim.id,
        status: 'APPROVED',
        water: { id: water.id, status: 'CONNECTED' },
        reviewedAt: FIXED_NOW.toISOString(),
      });
      expect(
        await prisma.fishingWater.findUniqueOrThrow({ where: { id: water.id } }),
      ).toMatchObject({
        status: 'CONNECTED',
        organizationId: admin.organizationId,
      });
      expect(await prisma.waterClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({
        status: 'APPROVED',
        reviewedById: superAdminId,
        reviewedAt: FIXED_NOW,
      });
      expect(await prisma.waterClaim.findUniqueOrThrow({ where: { id: rival.id } })).toMatchObject({
        status: 'REJECTED',
        reviewedById: superAdminId,
      });
      expect(
        (await prisma.waterClaim.findUniqueOrThrow({ where: { id: unrelated.id } })).status,
      ).toBe('PENDING');
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          actorId: superAdminId,
          action: 'CLAIM_APPROVED',
          entity: 'WaterClaim',
          entityId: claim.id,
          diff: {
            status: { from: 'PENDING', to: 'APPROVED' },
            fishingWaterId: water.id,
            organizationId: admin.organizationId,
            comment: null,
            rejectedClaimIds: [rival.id],
          },
        }),
      ]);
    });

    it('rejects with a comment and leaves the water unclaimed', async () => {
      const claim = await createClaim(prisma);

      const response = await review(claim.id, {
        decision: 'REJECT',
        comment: '  Dokument nieczytelny ',
      }).expect(200);

      expect(response.body).toMatchObject({ status: 'REJECTED', comment: 'Dokument nieczytelny' });
      expect(
        (await prisma.fishingWater.findUniqueOrThrow({ where: { id: claim.fishingWaterId } }))
          .status,
      ).toBe('UNCLAIMED');
      expect(await prisma.auditLog.findMany()).toEqual([
        expect.objectContaining({
          action: 'CLAIM_REJECTED',
          entityId: claim.id,
          diff: expect.objectContaining({ comment: 'Dokument nieczytelny' }) as unknown,
        }),
      ]);
    });

    it('refuses to review a claim twice', async () => {
      const claim = await createClaim(prisma, { status: 'REJECTED' });

      const response = await review(claim.id, { decision: 'APPROVE' }).expect(409);

      expect(response.body).toMatchObject({
        code: 'CLAIM_NOT_PENDING',
        details: { status: 'REJECTED' },
      });
    });

    it('refuses to approve a claim of a water that is already connected and changes nothing', async () => {
      const owner = await createOrganization(prisma, { status: 'ACTIVE' });
      const water = await createWater(prisma, { status: 'CONNECTED', organizationId: owner.id });
      const claim = await createClaim(prisma, { fishingWaterId: water.id });

      const response = await review(claim.id, { decision: 'APPROVE' }).expect(409);

      expect(response.body).toMatchObject({ code: 'WATER_ALREADY_CONNECTED' });
      expect((await prisma.waterClaim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe(
        'PENDING',
      );
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('approves only one of two claims of a water approved at the same time', async () => {
      const water = await createWater(prisma);
      const first = await createClaim(prisma, { fishingWaterId: water.id });
      const second = await createClaim(prisma, { fishingWaterId: water.id });

      const responses = await Promise.all([
        review(first.id, { decision: 'APPROVE' }),
        review(second.id, { decision: 'APPROVE' }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      // The loser either waited for the water inside its transaction, or read its claim only
      // after the winner had already rejected it as a rival: both answers are true.
      expect([
        { code: 'WATER_ALREADY_CONNECTED' },
        { code: 'CLAIM_NOT_PENDING', status: 'REJECTED' },
      ]).toContainEqual(loserOutcome(responses));
      const statuses = await prisma.waterClaim.findMany({ select: { status: true } });
      expect(statuses.map((claim) => claim.status).sort()).toEqual(['APPROVED', 'REJECTED']);
      expect(await prisma.auditLog.count()).toBe(1);
    });

    it('answers CLAIM_NOT_PENDING to the second of two approvals of the same claim', async () => {
      const claim = await createClaim(prisma);

      const responses = await Promise.all([
        review(claim.id, { decision: 'APPROVE' }),
        review(claim.id, { decision: 'APPROVE' }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
        code: 'CLAIM_NOT_PENDING',
        details: { status: 'APPROVED' },
      });
      expect(await prisma.auditLog.count()).toBe(1);
    });

    it('keeps the water and the claim consistent when approval and rejection race', async () => {
      const claim = await createClaim(prisma);

      const responses = await Promise.all([
        review(claim.id, { decision: 'APPROVE' }),
        review(claim.id, { decision: 'REJECT' }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      const final = await prisma.waterClaim.findUniqueOrThrow({ where: { id: claim.id } });
      const water = await prisma.fishingWater.findUniqueOrThrow({
        where: { id: claim.fishingWaterId },
      });
      // A lost approval has already connected the water in its transaction: it must be undone.
      expect(water.status).toBe(final.status === 'APPROVED' ? 'CONNECTED' : 'UNCLAIMED');
      expect(await prisma.auditLog.findMany({ select: { action: true } })).toEqual([
        { action: final.status === 'APPROVED' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED' },
      ]);
    });

    it.each(['BLOCKED', 'PENDING'] as const)(
      'refuses to approve for a %s organization but lets the claim be rejected',
      async (status) => {
        const organization = await createOrganization(prisma, { status });
        const water = await createWater(prisma);
        const claim = await createClaim(prisma, {
          fishingWaterId: water.id,
          organizationId: organization.id,
        });
        const rival = await createClaim(prisma, { fishingWaterId: water.id });

        const response = await review(claim.id, { decision: 'APPROVE' }).expect(403);

        expect(response.body).toMatchObject({ code: 'ORG_NOT_ACTIVE', details: { status } });
        expect(
          (await prisma.fishingWater.findUniqueOrThrow({ where: { id: water.id } })).status,
        ).toBe('UNCLAIMED');
        expect(
          (await prisma.waterClaim.findUniqueOrThrow({ where: { id: rival.id } })).status,
        ).toBe('PENDING');
        expect(await prisma.auditLog.count()).toBe(0);
        await review(claim.id, { decision: 'REJECT' }).expect(200);
      },
    );

    it('validates the decision and the comment length', async () => {
      const claim = await createClaim(prisma);

      await review(claim.id, { decision: 'MAYBE' }).expect(400);
      await review(claim.id, { decision: 'REJECT', comment: 'x'.repeat(1001) }).expect(400);
    });

    it('answers 404 for an unknown claim and 403 for a non super admin', async () => {
      const claim = await createClaim(prisma);

      await review('00000000-0000-4000-8000-000000000000', { decision: 'APPROVE' }).expect(404);
      const response = await review(claim.id, { decision: 'APPROVE' }, admin.accessToken).expect(
        403,
      );
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('GET /admin/claims/:id/document', () => {
    it('serves the stored document as an attachment', async () => {
      const water = await createWater(prisma);
      const { id } = (await submit(water.id).expect(201)).body as Claim;

      const response = await request(server())
        .get(`/api/v1/admin/claims/${id}/document`)
        .set(bearer(superAdminToken))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="claim-${id}.pdf"`,
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual(PDF);
    });

    it('answers 404 for an unknown claim, a lost file and 400 for a non-UUID id', async () => {
      // The factory gives the claim a key, but no file is stored under it.
      const withoutFile = await createClaim(prisma);
      const get = (id: string) =>
        request(server()).get(`/api/v1/admin/claims/${id}/document`).set(bearer(superAdminToken));

      await get('00000000-0000-4000-8000-000000000000').expect(404);
      const lost = await get(withoutFile.id).expect(404);
      expect(lost.body).toMatchObject({ code: 'NOT_FOUND' });
      await get('not-a-uuid').expect(400);
    });

    it('is only for the super admin', async () => {
      const claim = await createClaim(prisma);

      await request(server())
        .get(`/api/v1/admin/claims/${claim.id}/document`)
        .set(bearer(admin.accessToken))
        .expect(403);
    });
  });
});
