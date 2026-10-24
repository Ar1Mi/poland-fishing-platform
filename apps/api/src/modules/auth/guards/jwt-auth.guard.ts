import { ErrorCode } from '@lowisko/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../../../common/errors/domain-error';
import { AccessTokenService } from '../access-token.service';
import { type AuthenticatedRequest, IS_PUBLIC } from '../decorators/auth.decorators';

// The scheme name is case-insensitive (RFC 7235).
const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i;

/** Global guard: every route needs `Authorization: Bearer <access JWT>` unless it is @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Missing access token');
    }
    request.user = { id: await this.accessTokens.verify(token) };
    return true;
  }
}
