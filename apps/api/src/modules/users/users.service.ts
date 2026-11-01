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

  /** First and last names of active users for lists of other modules (inspections), keyed by id. */
  async findNames(ids: string[]): Promise<Map<string, Pick<User, 'firstName' | 'lastName'>>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map(({ id, ...name }) => [id, name]));
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
