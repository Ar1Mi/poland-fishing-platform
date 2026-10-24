import { ErrorCode } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errors, jwtVerify, SignJWT } from 'jose';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import type { Env } from '../../config/env';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';

const ALGORITHM = 'HS256';
const AUDIENCE = 'lowisko-api';

/** Short-lived access JWT `{ sub: userId }`; the web keeps it in memory only (docs/07-security.md). */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    config: ConfigService<Env, true>,
    private readonly clock: ClockService,
  ) {
    this.key = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET', { infer: true }));
  }

  sign(userId: string): Promise<string> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT()
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  /** User id of a valid token; TOKEN_EXPIRED tells the client to refresh, anything else is 401. */
  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        audience: AUDIENCE,
        currentDate: this.clock.now(),
        requiredClaims: ['sub', 'exp'],
      });
      return payload.sub as string;
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new DomainError(ErrorCode.TOKEN_EXPIRED, undefined, 'Access token expired');
      }
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Invalid access token');
    }
  }
}
