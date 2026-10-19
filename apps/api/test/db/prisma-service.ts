import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env';
import { PrismaService } from '../../src/database/prisma.service';

/** PrismaService bound to a test database, for `.overrideProvider(PrismaService)`. */
export function prismaServiceFor(url: string): PrismaService {
  const config = { get: () => url } as unknown as ConfigService<Env, true>;
  return new PrismaService(config);
}
