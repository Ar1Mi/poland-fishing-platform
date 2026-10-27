import { ErrorCode, effectivePermitStatus, EffectivePermitStatus } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import type { Permit, PermitType } from '../../../generated/prisma/client';
import { OrganizationsService } from '../../organizations/organizations.service';
import { UsersService } from '../../users/users.service';
import { WatersService } from '../../waters/waters.service';
import type { MyPermitDto } from '../dto/permit.dto';
import { PermitPdfService } from '../pdf/permit-pdf.service';
import { fromDbDate } from '../permit-dates';
import { QrTokenService } from '../qr/qr-token.service';

/** Statuses in which the permit can be shown to an inspector: it has a QR token and a PDF. */
const WITH_QR: ReadonlySet<EffectivePermitStatus> = new Set([
  EffectivePermitStatus.SCHEDULED,
  EffectivePermitStatus.ACTIVE,
]);

export interface PermitPdf {
  fileName: string;
  content: Buffer;
}

/** The angler's own permits: the list, one permit (polled after payment), its QR and PDF. */
@Injectable()
export class MyPermitsService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly users: UsersService,
    private readonly waters: WatersService,
    private readonly qrTokens: QrTokenService,
    private readonly pdfs: PermitPdfService,
    private readonly clock: ClockService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  /** All permits of the user, latest start first; there are a few a season, so no paging. */
  async list(userId: string): Promise<MyPermitDto[]> {
    const permits = await this.prisma.permit.findMany({
      where: { userId },
      include: { permitType: true },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    const organizations = await this.organizations.findSummaries([
      ...new Set(permits.map((permit) => permit.permitType.organizationId)),
    ]);
    return Promise.all(
      permits.map((permit) =>
        this.toDto(permit, organizations.get(permit.permitType.organizationId)?.name ?? ''),
      ),
    );
  }

  /** A permit of someone else is as unknown as a missing one. */
  async get(userId: string, id: string): Promise<MyPermitDto> {
    const permit = await this.find(userId, id);
    const organization = await this.organizations.findPublicProfile(
      permit.permitType.organizationId,
    );
    // The type keeps its organization (FK), so the profile always exists.
    return this.toDto(permit, organization?.name ?? '');
  }

  /** The printable permit with its QR code; only while the QR is valid (SCHEDULED or ACTIVE). */
  async pdf(userId: string, id: string): Promise<PermitPdf> {
    const permit = await this.get(userId, id);
    if (permit.qrToken === null) {
      throw new DomainError(
        ErrorCode.PERMIT_NOT_VALID,
        { status: permit.status },
        'Only a scheduled or active permit has a PDF',
      );
    }
    const [holder, type] = await Promise.all([
      this.users.findById(userId),
      this.prisma.permitType.findUniqueOrThrow({
        where: { id: permit.permitType.id },
        select: { waters: { select: { id: true } } },
      }),
    ]);
    if (!holder) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
    }
    const waterNames = await this.waters.findNames(type.waters.map((water) => water.id));
    const content = await this.pdfs.render({
      permit,
      holder: {
        firstName: holder.firstName,
        lastName: holder.lastName,
        birthDate: fromDbDate(holder.birthDate),
        anglerCardNo: holder.anglerCardNo,
      },
      waterNames: [...waterNames.values()].sort((a, b) => a.localeCompare(b, 'pl')),
      verifyUrl: `${this.webUrl}/verify/${permit.qrToken}`,
      generatedAt: this.clock.now(),
    });
    return { fileName: `${permit.number}.pdf`, content };
  }

  private async find(userId: string, id: string) {
    const permit = await this.prisma.permit.findFirst({
      where: { id, userId },
      include: { permitType: true },
    });
    if (!permit) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
    }
    return permit;
  }

  private async toDto(
    permit: Permit & { permitType: PermitType },
    organizationName: string,
  ): Promise<MyPermitDto> {
    const validFrom = fromDbDate(permit.validFrom);
    const validTo = fromDbDate(permit.validTo);
    const status = effectivePermitStatus(
      { status: permit.status, validFrom, validTo },
      this.clock.now(),
    );
    const { permitType: type } = permit;
    return {
      id: permit.id,
      number: permit.number,
      status,
      validFrom,
      validTo,
      pricePaidGrosze: permit.pricePaidGrosze,
      permitType: {
        id: type.id,
        name: type.name,
        durationDays: type.durationDays,
        discountKind: type.discountKind,
      },
      organization: { id: type.organizationId, name: organizationName },
      createdAt: permit.createdAt.toISOString(),
      qrToken: WITH_QR.has(status) ? await this.qrTokens.sign(permit.id, validTo) : null,
    };
  }
}
