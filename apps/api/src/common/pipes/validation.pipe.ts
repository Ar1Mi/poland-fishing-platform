import { ErrorCode } from '@lowisko/shared';
import { type ValidationError, ValidationPipe } from '@nestjs/common';
import { DomainError } from '../errors/domain-error';

/** Flattens class-validator errors to `{ [field]: string[] }`; nested fields get a dotted path. */
export function toFieldErrors(errors: ValidationError[], parent = ''): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }
    Object.assign(fields, toFieldErrors(error.children ?? [], path));
  }
  return fields;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: toFieldErrors(errors) },
        'Request validation failed',
      ),
  });
}
