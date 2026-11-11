import { ErrorCode, type Locale, warsawDate } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma, User } from '../../generated/prisma/client';
import type { ProfileDto, UpdateProfileDto } from './dto/profile.dto';

export type Db = Prisma.TransactionClient;

export interface NewUser {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  anglerCardNo?: string;
  locale?: Locale;
}

/** Emails are compared case-insensitively: stored and looked up in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const toDate = (dateOnly: string): Date => new Date(`${dateOnly}T00:00:00.000Z`);

/**
 * The address an anonymised account keeps (`.invalid` never resolves, RFC 2606): unique like
 * the column, and never an address someone could register or invite.
 */
export function anonymizedEmail(userId: string): string {
  return `deleted-${userId}@anonymized.invalid`;
}

/** Placeholders of the NOT NULL personal fields of an anonymised account (T-26). */
const ANONYMIZED_BIRTH_DATE = toDate('1900-01-01');
/** Not an argon2 hash: nothing verifies against it (login does not look at such rows anyway). */
const NO_PASSWORD = '!';

/** The profile in the RODO export: the API profile and when the account began. */
export interface ExportedProfile extends ProfileDto {
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

/**
 * Owner of the `User` table. Methods that take part in another module's transaction accept
 * its client as `db`.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Active (not anonymised) user by id. */
  findById(id: string, db: Db = this.prisma): Promise<User | null> {
    return db.user.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * A write of the user's personal data (a catch with its position, an external permit and its
   * photo) checks the account inside its own transaction: `FOR SHARE` of the `User` row waits for
   * an account deletion under way (`lockForDeletion`) and then sees it anonymised. Without it a
   * request that passed the guard just before the deletion committed would attach new data to the
   * anonymised row. Taken first in the transaction, before the module's own locks — the order of
   * the deletion. Writes of one user do not wait for each other (`FOR SHARE` is shared).
   */
  async assertActiveForWrite(db: Db, id: string): Promise<void> {
    const [row] = await db.$queryRaw<{ deletedAt: Date | null }[]>`
      SELECT "deletedAt" FROM "User" WHERE "id" = ${id}::uuid FOR SHARE`;
    if (!row || row.deletedAt) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Account deleted');
    }
  }

  /**
   * The first lock of an account deletion after the email links (docs/04-data-model.md): the
   * writes of `assertActiveForWrite` wait for it, and it waits for those under way. `FOR NO KEY
   * UPDATE` does not stop the foreign-key checks of inserts that reference the user.
   */
  async lockForDeletion(db: Db, id: string): Promise<void> {
    const [row] = await db.$queryRaw<{ deletedAt: Date | null }[]>`
      SELECT "deletedAt" FROM "User" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE`;
    if (!row || row.deletedAt) {
      // Deleted by a concurrent request meanwhile.
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Account deleted');
    }
  }

  /** The account exists and is not anonymised: one primary-key lookup per request (guard). */
  async isActive(id: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id, deletedAt: null } })) > 0;
  }

  /** First and last names of active users for lists of other modules (inspections), keyed by id. */
  async findNames(ids: string[]): Promise<Map<string, Pick<User, 'firstName' | 'lastName'>>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map(({ id, ...name }) => [id, name]));
  }

  /** Names and addresses of active users for the member list of an organization, keyed by id. */
  async findContacts(
    ids: string[],
  ): Promise<Map<string, Pick<User, 'firstName' | 'lastName' | 'email'>>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return new Map(users.map(({ id, ...contact }) => [id, contact]));
  }

  findByEmail(email: string, db: Db = this.prisma): Promise<User | null> {
    return db.user.findFirst({ where: { email: normalizeEmail(email), deletedAt: null } });
  }

  async existsByEmail(email: string, db: Db = this.prisma): Promise<boolean> {
    // Anonymised accounts keep a placeholder email, so any row with the address counts.
    return (await db.user.count({ where: { email: normalizeEmail(email) } })) > 0;
  }

  create(user: NewUser, db: Db = this.prisma): Promise<User> {
    this.assertBirthDate(user.birthDate);
    return db.user.create({
      data: {
        ...user,
        email: normalizeEmail(user.email),
        birthDate: toDate(user.birthDate),
        anglerCardNo: user.anglerCardNo || null,
      },
    });
  }

  async markEmailVerified(id: string, db: Db = this.prisma): Promise<void> {
    // Keeps the first confirmation time when a reset link proves the address again.
    await db.user.updateMany({
      where: { id, emailVerifiedAt: null },
      data: { emailVerifiedAt: this.clock.now() },
    });
  }

  async setPasswordHash(id: string, passwordHash: string, db: Db = this.prisma): Promise<void> {
    await db.user.update({ where: { id }, data: { passwordHash } });
  }

  async getProfile(id: string): Promise<ProfileDto> {
    const user = await this.findById(id);
    if (!user) {
      // The access token outlived the account (anonymised meanwhile).
      throw new DomainError(ErrorCode.UNAUTHENTICATED);
    }
    return toProfile(user);
  }

  async updateProfile(id: string, changes: UpdateProfileDto): Promise<ProfileDto> {
    await this.getProfile(id);
    if (changes.birthDate !== undefined) {
      this.assertBirthDate(changes.birthDate);
    }
    // Conditional: a change waiting for an account deletion must not write the real name back
    // over the placeholders once it commits.
    const { count } = await this.prisma.user.updateMany({
      where: { id, deletedAt: null },
      data: {
        ...changes,
        birthDate: changes.birthDate === undefined ? undefined : toDate(changes.birthDate),
        anglerCardNo: changes.anglerCardNo === undefined ? undefined : changes.anglerCardNo || null,
      },
    });
    if (count === 0) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED, undefined, 'Account deleted');
    }
    return this.getProfile(id);
  }

  /** The RODO export (T-26); null if the account is gone. */
  async exportProfile(id: string): Promise<ExportedProfile | null> {
    const user = await this.findById(id);
    return user
      ? { ...toProfile(user), emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt }
      : null;
  }

  /**
   * Account deletion (T-26, docs/07-security.md): the personal fields get placeholders and
   * `deletedAt` is set; the row stays, so permits, catches and protocols keep a (masked) owner.
   * False if it was anonymised already (a second deletion at once).
   */
  async anonymize(id: string, db: Db): Promise<boolean> {
    const { count } = await db.user.updateMany({
      where: { id, deletedAt: null },
      data: {
        email: anonymizedEmail(id),
        emailVerifiedAt: null,
        passwordHash: NO_PASSWORD,
        firstName: '',
        lastName: '',
        birthDate: ANONYMIZED_BIRTH_DATE,
        anglerCardNo: null,
        isSuperAdmin: false,
        deletedAt: this.clock.now(),
      },
    });
    return count > 0;
  }

  /** A birth date in the future (Warsaw calendar) would make BR-08 discounts meaningless. */
  private assertBirthDate(birthDate: string): void {
    if (birthDate > warsawDate(this.clock.now())) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { birthDate: ['birthDate must not be in the future'] } },
        'Request validation failed',
      );
    }
  }
}

export function toProfile(user: User): ProfileDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate.toISOString().slice(0, 10),
    anglerCardNo: user.anglerCardNo,
    locale: user.locale,
    isSuperAdmin: user.isSuperAdmin,
  };
}
