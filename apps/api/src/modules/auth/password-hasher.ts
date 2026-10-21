import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** argon2id with the library defaults (64 MiB, t=3, p=4), above the OWASP minimum (NFR-04). */
@Injectable()
export class PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /**
   * Same work as a real check for an email without an account, so the login response time
   * does not reveal which emails are registered.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy password for timing');
    await verify(await this.dummyHash, password);
    return false;
  }
}
