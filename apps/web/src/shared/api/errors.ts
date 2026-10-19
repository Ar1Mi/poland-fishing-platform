import { ErrorCode } from '@lowisko/shared';

/**
 * Failures that never come from the API as `{ code }`: the server was not reached, or the
 * response is not in the API error format (e.g. an HTML 502 from a proxy).
 */
export const ClientErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;
export type ClientErrorCode = (typeof ClientErrorCode)[keyof typeof ClientErrorCode];

export type ApiErrorCode = ErrorCode | ClientErrorCode;

const API_ERROR_CODES = new Set<string>(Object.values(ErrorCode));
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** Error thrown by `request()`; the UI shows it as `t(errorMessageKey(error))`. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    /** HTTP status; undefined when no response arrived. */
    readonly status?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Turns an error response body (`{ code, message, details? }`, docs/05-api.md) into an ApiError. */
export function parseErrorBody(body: unknown, status: number): ApiError {
  if (isRecord(body) && typeof body.code === 'string' && API_ERROR_CODES.has(body.code)) {
    return new ApiError(
      body.code as ErrorCode,
      typeof body.message === 'string' ? body.message : body.code,
      status,
      isRecord(body.details) ? body.details : undefined,
    );
  }
  // The proxy in front of the API (Vite in dev, Caddy in prod) answers for an API it cannot reach.
  const code = GATEWAY_STATUSES.has(status)
    ? ClientErrorCode.NETWORK_ERROR
    : ClientErrorCode.UNKNOWN_ERROR;
  return new ApiError(code, `Unexpected error response (HTTP ${status})`, status);
}

/** i18n key of the message for any error caught from a query or mutation. */
export function errorMessageKey(error: unknown): `errors.${ApiErrorCode}` {
  return `errors.${error instanceof ApiError ? error.code : ClientErrorCode.UNKNOWN_ERROR}`;
}
