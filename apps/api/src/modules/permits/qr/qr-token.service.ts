import { type DateOnly, warsawDayEnd } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { ClockService } from '../../../common/clock/clock.service';
import type { Env } from '../../../config/env';

const ALGORITHM = 'EdDSA';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permit QR tokens (ADR-0006): a JWS `{ sub: permitId, exp }` signed with Ed25519, valid until the
 * end of the permit's last Warsaw day. The token proves only that the platform issued it: whoever
 * checks it must also read the permit's current status.
 */
@Injectable()
export class QrTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(
    config: ConfigService<Env, true>,
    private readonly clock: ClockService,
  ) {
    // The environment check (config/env.ts) already made sure the pair is Ed25519 and matches.
    this.privateKey = createPrivateKey(config.get('QR_SIGNING_PRIVATE_KEY', { infer: true }));
    this.publicKey = createPublicKey(config.get('QR_SIGNING_PUBLIC_KEY', { infer: true }));
  }

  /** No `iat`: the same permit always gets the same token (Ed25519 signatures are deterministic). */
  sign(permitId: string, validTo: DateOnly): Promise<string> {
    return new SignJWT()
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(permitId)
      .setExpirationTime(Math.floor(warsawDayEnd(validTo).getTime() / 1000))
      .sign(this.privateKey);
  }

  /** Permit id of a genuine, unexpired token; `null` for anything else (the check of T-19). */
  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: [ALGORITHM],
        currentDate: this.clock.now(),
        requiredClaims: ['sub', 'exp'],
      });
      return typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
