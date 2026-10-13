import type { ErrorCode } from '@lowisko/shared';

/**
 * Business error. `HttpExceptionFilter` turns it into `{ code, message, details? }`
 * with the HTTP status mapped from the code.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    message: string = code,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
