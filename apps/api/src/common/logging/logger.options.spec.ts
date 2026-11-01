import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { buildLoggerOptions } from './logger.options';

interface LogLine {
  level: number;
  req: { id: string; url: string; headers: Record<string, string> };
  res: { headers: Record<string, string> };
}

function createLoggedServer(nodeEnv: 'production' | 'test') {
  const lines: LogLine[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as LogLine);
      callback();
    },
  });
  const middleware = pinoHttp(buildLoggerOptions(nodeEnv), sink);
  const server = createServer((req, res) => {
    middleware(req, res);
    res.setHeader('Set-Cookie', 'rt=refresh-secret; HttpOnly');
    res.end('ok');
  });
  return { server, lines };
}

describe('buildLoggerOptions', () => {
  it('writes one JSON line per request with the id returned in X-Request-Id', async () => {
    const { server, lines } = createLoggedServer('production');

    const response = await request(server).get('/').set('X-Request-Id', 'trace-42');

    expect(response.headers['x-request-id']).toBe('trace-42');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.req.id).toBe('trace-42');
  });

  it('replaces an unsafe incoming request id with a UUID', async () => {
    const { server, lines } = createLoggedServer('production');

    const response = await request(server).get('/').set('X-Request-Id', 'bad id\twith spaces');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[0]?.req.id).toBe(response.headers['x-request-id']);
  });

  it('keeps Authorization, Cookie and Set-Cookie values out of the log', async () => {
    const { server, lines } = createLoggedServer('production');

    await request(server)
      .get('/')
      .set('Authorization', 'Bearer access-secret')
      .set('Cookie', 'rt=refresh-secret');

    expect(lines[0]?.req.headers.authorization).toBe('[Redacted]');
    expect(lines[0]?.req.headers.cookie).toBe('[Redacted]');
    expect(lines[0]?.res.headers['set-cookie']).toBe('[Redacted]');
    expect(JSON.stringify(lines)).not.toMatch(/access-secret|refresh-secret/);
  });

  it('keeps the QR token of a permit check out of the logged URL', async () => {
    const { server, lines } = createLoggedServer('production');

    await request(server).get('/api/v1/verify/eyJhbGciOiJFZERTQSJ9.payload.signature?x=1');
    await request(server).get('/api/v1/auth/verify-email');

    expect(lines.map(({ req }) => req.url)).toEqual([
      '/api/v1/verify/[Redacted]?x=1',
      '/api/v1/auth/verify-email',
    ]);
    expect(JSON.stringify(lines)).not.toMatch(/payload\.signature/);
  });

  it('is silent under NODE_ENV=test', async () => {
    const { server, lines } = createLoggedServer('test');

    await request(server).get('/');

    expect(lines).toEqual([]);
  });
});
