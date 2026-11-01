import { ErrorCode } from '@lowisko/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../../../common/errors/domain-error';
import { AccessTokenService } from '../access-token.service';
import {
  type AuthenticatedRequest,
  IS_OPTIONAL_AUTH,
  IS_PUBLIC,
} from '../decorators/auth.decorators';

// The scheme name is case-insensitive (RFC 7235).
const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i;

/**
 * Global guard: every route needs `Authorization: Bearer <access JWT>` unless it is @Public();
 * an @OptionalAuth() route checks the header only when it is sent.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      request.headers.authorization === undefined &&
      this.reflector.getAllAndOverride<boolean | undefined>(IS_OPTIONAL_AUTH, targets)
    ) {
      return true;
    }
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Missing access token');
    }
    request.user = { id: await this.accessTokens.verify(token) };
    return true;
  }
}
