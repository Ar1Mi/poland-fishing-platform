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
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...changes,
        birthDate: changes.birthDate === undefined ? undefined : toDate(changes.birthDate),
        anglerCardNo: changes.anglerCardNo === undefined ? undefined : changes.anglerCardNo || null,
      },
    });
    return toProfile(user);
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
