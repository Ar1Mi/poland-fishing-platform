import { randomUUID } from 'node:crypto';
import type { Options } from 'pino-http';
import type { Env } from '../../config/env';

export const REQUEST_ID_HEADER = 'x-request-id';

// A client-supplied id is reused only if it cannot break a log line or a header.
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

// The QR token of a permit travels in the path of `GET /verify/:token` (ADR-0006).
const QR_TOKEN_IN_PATH = /(\/verify\/)[^/?#]+/;

interface LoggedRequest {
  url?: string;
  params?: Record<string, string>;
}

/** Keeps QR tokens out of the access log: they open a permit check until its last day. */
function withoutQrToken(req: LoggedRequest): LoggedRequest {
  req.url = req.url?.replace(QR_TOKEN_IN_PATH, '$1[Redacted]');
  if (req.params?.token !== undefined) {
    req.params = { ...req.params, token: '[Redacted]' };
  }
  return req;
}

const LEVEL: Readonly<Record<Env['NODE_ENV'], string>> = {
  development: 'debug',
  test: 'silent',
  production: 'info',
};

/** JSON logs in production, pretty output in development, request id on every line. */
export function buildLoggerOptions(nodeEnv: Env['NODE_ENV']): Options {
  return {
    level: LEVEL[nodeEnv],
    ...(nodeEnv === 'development' && {
      transport: { target: 'pino-pretty', options: { singleLine: true } },
    }),
    genReqId: (req, res) => {
      const incoming = req.headers[REQUEST_ID_HEADER];
      const id =
        typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    serializers: { req: withoutQrToken },
  };
}
