import type { NestExpressApplication } from '@nestjs/platform-express';
import { hash } from 'argon2';
import request, { type Response } from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createUser } from './factories';

export const PASSWORD = 'correct horse battery';

/** A confirmed account that can log in with PASSWORD. */
export async function createVerifiedUser(
  prisma: PrismaClient,
  data: Parameters<typeof createUser>[1] = {},
) {
  return createUser(prisma, {
    passwordHash: await hash(PASSWORD),
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...data,
  });
}

/** `rt=<value>` from Set-Cookie, ready for a Cookie header; undefined when not set. */
export function refreshCookie(response: Response): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('rt='))?.split(';')[0];
  return cookie === 'rt=' ? undefined : cookie;
}

export interface LoggedIn {
  accessToken: string;
  cookie: string;
}

export async function login(
  app: NestExpressApplication,
  email: string,
  password = PASSWORD,
): Promise<LoggedIn> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const cookie = refreshCookie(response);
  if (!cookie) throw new Error('Login did not set the refresh cookie');
  return { accessToken: (response.body as { accessToken: string }).accessToken, cookie };
}
