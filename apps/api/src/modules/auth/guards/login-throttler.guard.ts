import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { normalizeEmail } from '../../users/users.service';

/**
 * Login brute-force limit per IP **and** email (docs/07-security.md): guessing one account is
 * slowed down, while users behind one NAT do not lock each other out.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    // Guards run before validation, so the body may be anything.
    const body: unknown = req.body;
    const email =
      typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
        ? normalizeEmail(body.email)
        : '';
    return Promise.resolve(`${req.ip ?? ''}|${email}`);
  }
}
