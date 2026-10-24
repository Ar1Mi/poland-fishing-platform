import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-test-app';
import { prismaServiceFor } from './db/prisma-service';
import { createTestDatabase, type TestDatabase } from './db/test-database';
import { createSpecies } from './factories';

describe('GET /species', () => {
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

  it('lists the dictionary to a guest by Polish name, with names in every language', async () => {
    const pike = await createSpecies(prisma, {
      latinName: 'Esox lucius',
      namePl: 'Szczupak',
      nameEn: 'Northern pike',
      nameRu: 'Щука',
    });
    await createSpecies(prisma, { latinName: 'Perca fluviatilis', namePl: 'Okoń' });
    await createSpecies(prisma, {
      latinName: 'Hucho hucho',
      namePl: 'Głowacica',
      isProtected: true,
    });

    const response = await request(app.getHttpServer()).get('/api/v1/species').expect(200);

    const body = response.body as { namePl: string }[];
    expect(body.map((species) => species.namePl)).toEqual(['Głowacica', 'Okoń', 'Szczupak']);
    expect(body[2]).toEqual({
      id: pike.id,
      latinName: 'Esox lucius',
      namePl: 'Szczupak',
      nameEn: 'Northern pike',
      nameRu: 'Щука',
      isProtected: false,
    });
    expect(body[0]).toMatchObject({ isProtected: true });
  });
});
