import { ErrorCode } from '@lowisko/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './create-test-app';

describe('Swagger', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the UI on /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
  });

  it('describes /api/v1/health in the OpenAPI JSON on /api/docs-json', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body).toMatchObject({
      components: {
        schemas: {
          ErrorResponseDto: {
            properties: { code: { allOf: [{ $ref: '#/components/schemas/ErrorCode' }] } },
          },
          ErrorCode: { enum: Object.values(ErrorCode) },
        },
      },
      paths: {
        '/api/v1/health': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HealthResponseDto' },
                  },
                },
              },
            },
          },
        },
      },
    });
  });
});
