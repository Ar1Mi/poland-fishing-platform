import { ErrorCode, warsawDate } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OneTimeTokenService } from '../auth/one-time-token.service';
import { PasswordHasher } from '../auth/password-hasher';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { CatchesService } from '../catches/catches.service';
import { InspectionsService } from '../inspections/inspections.service';
import { InvitationsService } from '../organizations/members/invitations.service';
import { MembersService } from '../organizations/members/members.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ExternalPermitsService } from '../permits/external-permits/external-permits.service';
import { MyPermitsService } from '../permits/my-permits/my-permits.service';
import { UsersService } from '../users/users.service';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  type AccountExport,
  type ExportedInspectionView,
  type PerformedInspectionView,
} from './account-export';

export interface AccountExportFile {
  fileName: string;
  content: Buffer;
}

/** The deletion touches every module's rows of the user; more than Prisma's 5 s default. */
const DELETION_TIMEOUT_MS = 20_000;

/**
 * RODO rights of the user (docs/07-security.md, ADR-0016): the export of all their data and the
 * deletion of the account. Owns no table: each module gives its part through its exported
 * service, and the deletion runs them in one transaction.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordHasher,
    private readonly refreshTokens: RefreshTokenService,
    private readonly oneTimeTokens: OneTimeTokenService,
    private readonly organizations: OrganizationsService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
    private readonly permits: MyPermitsService,
    private readonly externalPermits: ExternalPermitsService,
    private readonly catches: CatchesService,
    private readonly inspections: InspectionsService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(AccountService.name);
  }

  async export(userId: string): Promise<AccountExportFile> {
    const profile = await this.users.exportProfile(userId);
    if (!profile) {
      // The access token outlived the account.
      throw new DomainError(ErrorCode.UNAUTHENTICATED);
    }
    const [
      organizations,
      invitations,
      permits,
      externalPermits,
      catches,
      performed,
      sessions,
      auditLog,
    ] = await Promise.all([
      this.organizations.listForUser(userId),
      this.invitations.listForEmail(profile.email),
      this.permits.listForExport(userId),
      this.externalPermits.list(userId),
      this.catches.listForExport(userId),
      this.inspections.listByInspector(userId),
      this.refreshTokens.listForExport(userId),
      this.audit.listByActor(userId),
    ]);
    const permitById = new Map(permits.map((permit) => [permit.id, permit]));
    const inspections = (
      await this.inspections.listOnPermits(permits.map((permit) => permit.id))
    ).map(({ permitId, organizationId, ...inspection }): ExportedInspectionView => {
      // The protocol's organization is the one of the permit's type (T-19).
      const permit = permitById.get(permitId)!;
      return {
        ...inspection,
        permit: { id: permitId, number: permit.number },
        organization: { id: organizationId, name: permit.organization.name },
      };
    });
    const inspectingOrganizations = await this.organizations.findSummaries([
      ...new Set(performed.map((inspection) => inspection.organizationId)),
    ]);
    const inspectionsPerformed = performed.map(
      ({ permitId, permitNumber, organizationId, ...inspection }): PerformedInspectionView => ({
        ...inspection,
        permit: { id: permitId, number: permitNumber },
        organization: {
          id: organizationId,
          name: inspectingOrganizations.get(organizationId)?.name ?? '',
        },
      }),
    );
    const now = this.clock.now();
    const data: AccountExport = {
      format: ACCOUNT_EXPORT_FORMAT,
      version: ACCOUNT_EXPORT_VERSION,
      exportedAt: now,
      profile,
      organizations,
      invitations,
      permits,
      externalPermits,
      catches,
      inspections,
      inspectionsPerformed,
      sessions,
      auditLog,
    };
    return {
      fileName: `lowisko-dane-${warsawDate(now)}.json`,
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8'),
    };
  }

  /**
   * `DELETE /me`: anonymises the account after the password confirms it is the user (decided by
   * the user: a stolen access token alone cannot delete). One transaction, its locks in the order
   * the other transactions of these rows take them (docs/04-data-model.md): email links (a
   * password reset: link, user row, refresh tokens), the user row (writes of personal data wait
   * for it — `assertActiveForWrite`), organizations, then their invitations (member changes),
   * audit entries, refresh tokens, the register, external permits. The photos of the external
   * permits are removed after the commit.
   */
  async delete(userId: string, password: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new DomainError(ErrorCode.UNAUTHENTICATED);
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS);
    }
    const photoKeys = await this.prisma.$transaction(
      async (tx) => {
        await this.oneTimeTokens.deleteAllForUser(userId, tx);
        await this.users.lockForDeletion(tx, userId);
        const { left, cancelledInvitations } = await this.members.removeDeletedAccount(
          tx,
          userId,
          user.email,
        );
        await this.audit.forgetInvitedEmail(tx, user.email);
        await this.refreshTokens.deleteAllForUser(userId, tx);
        const catchesWithPosition = await this.catches.anonymizeAllOfUser(tx, userId);
        const keys = await this.externalPermits.anonymizeAllOfUser(tx, userId);
        // Under the row lock taken above: a concurrent deletion has already failed on it.
        if (!(await this.users.anonymize(userId, tx))) {
          throw new DomainError(ErrorCode.UNAUTHENTICATED);
        }
        await this.audit.record(tx, {
          actorId: userId,
          action: 'ACCOUNT_DELETED',
          entity: 'User',
          entityId: userId,
          diff: {
            organizations: left.map(({ organizationId, roles }) => ({ organizationId, roles })),
            cancelledInvitations,
            catchesWithPosition,
            externalPermitPhotos: keys.length,
          },
        });
        return keys;
      },
      { timeout: DELETION_TIMEOUT_MS },
    );
    await this.externalPermits.removePhotos(photoKeys);
    this.logger.info({ userId }, 'Account deleted (anonymised)');
  }
}
