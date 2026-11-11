import { ErrorCode } from '@lowisko/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../../../common/errors/domain-error';
import { UsersService } from '../../users/users.service';
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
 * an @OptionalAuth() route checks the header only when it is sent. The token of an anonymised
 * account (`DELETE /me`, T-26) stops working at once, not 15 minutes later: an offline queue
 * synced in that window would attach new catches with positions to the deleted account.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly users: UsersService,
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
    const userId = await this.accessTokens.verify(token);
    if (!(await this.users.isActive(userId))) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Account deleted');
    }
    request.user = { id: userId };
    return true;
  }
}
