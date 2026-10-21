import type { ConfigService } from '@nestjs/config';
import { decodeJwt } from 'jose';
import type { Env } from '../../config/env';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const issuedAt = new Date('2026-10-06T15:20:00.000Z');
  let now: Date;
  const service = new AccessTokenService(
    { get: () => 'unit-test-secret-of-at-least-32-bytes' } as unknown as ConfigService<Env, true>,
    { now: () => now },
  );

  beforeEach(() => {
    now = issuedAt;
  });

  it('signs the user id as sub with a 15-minute lifetime', async () => {
    const token = await service.sign('user-1');

    expect(decodeJwt(token)).toEqual({
      sub: 'user-1',
      aud: 'lowisko-api',
      iat: issuedAt.getTime() / 1000,
      exp: issuedAt.getTime() / 1000 + 15 * 60,
    });
    await expect(service.verify(token)).resolves.toBe('user-1');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const token = await service.sign('user-1');
    now = new Date(issuedAt.getTime() + 15 * 60 * 1000 + 1000);

    await expect(service.verify(token)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it.each(['not-a-jwt', 'a.b.c', ''])('rejects %j with UNAUTHENTICATED', async (token) => {
    await expect(service.verify(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects an unsigned token (alg none)', async () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const token = `${encode({ alg: 'none' })}.${encode({ sub: 'admin', aud: 'lowisko-api', exp: 4e9 })}.`;

    await expect(service.verify(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
