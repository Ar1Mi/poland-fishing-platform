import { Injectable, type OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** argon2id with the library defaults (64 MiB, t=3, p=4), above the OWASP minimum (NFR-04). */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private dummyHash!: Promise<string>;

  /** Computed up front, so the first unknown-email login is not slower than the others. */
  onModuleInit(): void {
    this.dummyHash = this.hash('dummy password for timing');
  }

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
    await verify(await this.dummyHash, password);
    return false;
  }
}
