import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** Identity taken from a verified access token; `/me/*` routes use only this, never params. */
export interface AuthUser {
  id: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'auth:isPublic';

/** Opens a route (or a whole controller) to guests; every other route needs an access token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    // Only reachable on a @Public() route: a programming error, not a client one.
    throw new Error('@CurrentUser() used on a route without authentication');
  }
  return user;
});
