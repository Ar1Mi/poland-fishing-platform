import './trust-proxy-env';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './create-test-app';

/** Per-IP limit of anonymous auth routes (`ip` throttler, docs/07-security.md). */
const IP_LIMIT = 20;

/**
 * T-30: behind Caddy (TRUST_PROXY=1) the client address is the one Caddy puts into
 * X-Forwarded-For; without it every client would share the proxy's address and its limits.
 * The requests are invalid on purpose: the throttler counts them before validation, and
 * nothing reaches the database. Distinct emails keep the per-account `login` limit out of it.
 */
describe('TRUST_PROXY=1 (T-30)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const loginFrom = (ip: string, n: number) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: `client-${n}@lowisko.test` });

  it('counts the per-IP limit by the client address the proxy forwards', async () => {
    for (let i = 0; i < IP_LIMIT; i += 1) {
      expect((await loginFrom('203.0.113.10', i)).status).not.toBe(429);
    }
    await loginFrom('203.0.113.10', IP_LIMIT).expect(429);

    // Another client behind the same proxy keeps its own limit.
    expect((await loginFrom('203.0.113.20', IP_LIMIT + 1)).status).not.toBe(429);
  });

  it('takes the address the proxy appended, not one the client sent before it', async () => {
    for (let i = 0; i < IP_LIMIT; i += 1) {
      await loginFrom(`198.51.100.${i}, 203.0.113.30`, i);
    }
    await loginFrom('198.51.100.99, 203.0.113.30', IP_LIMIT).expect(429);
  });
});
