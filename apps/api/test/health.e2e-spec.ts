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

  it.each(['/health', '/api/health', '/api/v2/health', '/api/docsx'])(
    'answers %s outside the API prefix with a JSON 404 and a request id',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(404);

      expect(response.body).toEqual({ code: 'NOT_FOUND', message: `Cannot GET ${path}` });
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    },
  );

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
    // The allowed origin is static, so a foreign page never sees its own origin echoed back.
    expect(foreign.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('answers a CORS preflight for WEB_URL', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
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
