import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { StorageService } from '../src/common/storage/storage.service';
import type { PrismaService } from '../src/database/prisma.service';
import { ClaimDocumentCleanupJob } from '../src/modules/waters/claims/claim-document-cleanup.job';
import {
  CLAIM_DOCUMENT_RETENTION_DAYS,
  ClaimsService,
} from '../src/modules/waters/claims/claims.service';
import { createVerifiedUser, login } from './auth-helpers';
import { createTestApp, FIXED_NOW } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createClaim } from './factories';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(FIXED_NOW.getTime() - days * DAY_MS);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const UPLOADS_DIR = process.env.UPLOADS_DIR!;
const retention = CLAIM_DOCUMENT_RETENTION_DAYS;

const exists = (key: string) =>
  access(join(UPLOADS_DIR, key)).then(
    () => true,
    () => false,
  );

describe('ClaimDocumentCleanupJob (T-30)', () => {
  let db: TestDatabase;
  let prisma: PrismaService;
  let app: NestExpressApplication;

  beforeEach(async () => {
    db = await createTestDatabase();
    prisma = prismaServiceFor(db.url);
    app = await createTestApp({ prisma });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
    await db.drop();
  });

  /** A claim with its document really stored. */
  const claimWithFile = async (
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    decidedDaysAgo: number,
  ) => {
    const proofFileKey = await app.get(StorageService).save('claims', 'pdf', PDF);
    const at = daysAgo(decidedDaysAgo);
    return createClaim(prisma, {
      status,
      proofFileKey,
      createdAt: at,
      reviewedAt: status === 'PENDING' ? null : at,
    });
  };

  it(`deletes the documents of claims rejected more than ${retention} days ago, and only those`, async () => {
    const expired = await claimWithFile('REJECTED', retention + 1);
    const recent = await claimWithFile('REJECTED', retention - 1);
    // Exactly at the edge: kept until the next night.
    const edge = await claimWithFile('REJECTED', retention);
    const approved = await claimWithFile('APPROVED', retention * 3);
    const pending = await claimWithFile('PENDING', retention * 3);

    await app.get(ClaimDocumentCleanupJob).run();

    const keys = new Map(
      (await prisma.waterClaim.findMany()).map((claim) => [claim.id, claim.proofFileKey]),
    );
    expect(keys.get(expired.id)).toBeNull();
    expect(await exists(expired.proofFileKey!)).toBe(false);
    for (const kept of [recent, edge, approved, pending]) {
      expect(keys.get(kept.id)).toBe(kept.proofFileKey);
      expect(await exists(kept.proofFileKey!)).toBe(true);
    }
  });

  it('clears the key of an expired claim whose file is already gone', async () => {
    // The factory's key names no stored file.
    const claim = await createClaim(prisma, {
      status: 'REJECTED',
      reviewedAt: daysAgo(retention + 10),
    });

    await app.get(ClaimDocumentCleanupJob).run();

    expect(
      (await prisma.waterClaim.findUniqueOrThrow({ where: { id: claim.id } })).proofFileKey,
    ).toBeNull();
  });

  it('shows the super admin that the document is gone: no type, 404 on download', async () => {
    const claim = await claimWithFile('REJECTED', retention + 1);
    await app.get(ClaimDocumentCleanupJob).run();
    const superAdmin = await createVerifiedUser(prisma, { isSuperAdmin: true });
    const { accessToken } = await login(app, superAdmin.email);
    const get = (path: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/admin/${path}`)
        .set('Authorization', `Bearer ${accessToken}`);

    const list = await get('claims?status=REJECTED').expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: claim.id, documentType: null })]);
    const document = await get(`claims/${claim.id}/document`).expect(404);
    expect(document.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('clears each key once when two instances run at the same time', async () => {
    await Promise.all([claimWithFile('REJECTED', retention + 1), claimWithFile('REJECTED', 200)]);
    const claims = app.get(ClaimsService);

    const counts = await Promise.all([
      claims.deleteExpiredDocuments(),
      claims.deleteExpiredDocuments(),
    ]);

    expect(counts[0] + counts[1]).toBe(2);
  });
});
