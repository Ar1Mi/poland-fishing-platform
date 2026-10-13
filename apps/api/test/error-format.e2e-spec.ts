import { ErrorCode } from '@lowisko/shared';
import { Body, Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, ValidateNested } from 'class-validator';
import request from 'supertest';
import { DomainError } from '../src/common/errors/domain-error';
import { createTestApp } from './create-test-app';

class OwnerDto {
  @IsString()
  name!: string;
}

class EchoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lengthCm!: number;

  @ValidateNested()
  @Type(() => OwnerDto)
  owner!: OwnerDto;
}

@Controller('test-errors')
class TestErrorsController {
  @Post('echo')
  echo(@Body() dto: EchoDto): EchoDto {
    return dto;
  }

  @Get('domain')
  domain(): never {
    throw new DomainError(ErrorCode.PERMIT_TYPE_INACTIVE, { permitTypeId: 'pt-1' });
  }

  @Get('crash')
  crash(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
  }
}

// `expect.any()` is typed as `any`; narrowing it keeps the assertions type-checked.
const anyString: unknown = expect.any(String);

describe('error format { code, message, details? }', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TestErrorsController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with 404 NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

    expect(response.body).toEqual({ code: 'NOT_FOUND', message: anyString });
  });

  it('answers invalid input with 400 VALIDATION_FAILED and details.fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test-errors/echo')
      .send({ lengthCm: 0, owner: { name: 7 }, extra: true })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: {
        fields: {
          lengthCm: [anyString],
          'owner.name': [anyString],
          extra: [anyString],
        },
      },
    });
  });

  it('transforms valid input to the DTO types', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test-errors/echo')
      .send({ lengthCm: '42', owner: { name: 'Jan' } })
      .expect(201);

    expect(response.body).toEqual({ lengthCm: 42, owner: { name: 'Jan' } });
  });

  it('answers malformed JSON with 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/test-errors/echo')
      .set('Content-Type', 'application/json')
      .send('{"lengthCm":')
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('maps a DomainError to the status of its code', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/domain')
      .expect(422);

    expect(response.body).toEqual({
      code: 'PERMIT_TYPE_INACTIVE',
      message: 'PERMIT_TYPE_INACTIVE',
      details: { permitTypeId: 'pt-1' },
    });
  });

  it('answers an unexpected exception with 500 INTERNAL_ERROR without leaking the cause', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/test-errors/crash')
      .expect(500);

    expect(response.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
