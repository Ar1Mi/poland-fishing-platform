import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** Identity taken from a verified access token; `/me/*` routes use only this, never params. */
export interface AuthUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'auth:isPublic';
export const IS_OPTIONAL_AUTH = 'auth:isOptional';

/** Opens a route (or a whole controller) to guests; every other route needs an access token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Open to guests, but a sent access token is checked as on any route (401 when it is invalid or
 * expired, so the web refreshes it and repeats): the answer may show its holder more.
 * Read the user with `@OptionalUser()`.
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_OPTIONAL_AUTH, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    // Only reachable on a @Public() route: a programming error, not a client one.
    throw new Error('@CurrentUser() used on a route without authentication');
  }
  return user;
});

/** The user of an `@OptionalAuth()` route; undefined for a guest. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
