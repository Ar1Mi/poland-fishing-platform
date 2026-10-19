import * as shared from '@lowisko/shared';
import * as prismaEnums from '../generated/prisma/enums';

// ADR-0003: packages/shared mirrors every enum of schema.prisma, so the web app and
// the API agree on values without importing the generated client.
describe('shared enums', () => {
  const prismaNames = Object.keys(prismaEnums).sort();

  it('exist in shared for every Prisma enum', () => {
    const missing = prismaNames.filter((name) => !(name in shared));

    expect(missing).toEqual([]);
  });

  it.each(prismaNames)('%s has the same values as in Prisma', (name) => {
    const fromShared = (shared as Record<string, unknown>)[name];
    const fromPrisma = (prismaEnums as Record<string, unknown>)[name];

    expect(fromShared).toEqual(fromPrisma);
  });

  it('covers all 15 enums of docs/04-data-model.md', () => {
    expect(prismaNames).toHaveLength(15);
  });
});
