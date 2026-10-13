import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, FIXED_NOW } from './create-test-app';

describe('GET /api/v1/health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok with the time taken from ClockService', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', time: FIXED_NOW.toISOString() });
  });

  it('is not served outside the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('sets helmet security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS with credentials for WEB_URL only', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    const foreign = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(foreign.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('generates a request id and reuses a well-formed incoming one', async () => {
    const generated = await request(app.getHttpServer()).get('/api/v1/health');
    const reused = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-42');
    const replaced = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'not a safe id!');

    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(reused.headers['x-request-id']).toBe('trace-42');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
