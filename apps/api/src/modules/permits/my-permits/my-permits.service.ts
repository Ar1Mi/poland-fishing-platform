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

const WITH_TYPE = { permitType: { include: { waters: { select: { id: true } } } } } as const;

type PermitWithType = Permit & { permitType: PermitType & { waters: { id: string }[] } };

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
      include: WITH_TYPE,
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    const [organizations, waterNames] = await Promise.all([
      this.organizations.findSummaries([
        ...new Set(permits.map((permit) => permit.permitType.organizationId)),
      ]),
      this.waterNames(permits),
    ]);
    return Promise.all(
      permits.map((permit) =>
        this.toDto(
          permit,
          organizations.get(permit.permitType.organizationId)?.name ?? '',
          waterNames,
        ),
      ),
    );
  }

  /** A permit of someone else is as unknown as a missing one. */
  async get(userId: string, id: string): Promise<MyPermitDto> {
    const permit = await this.find(userId, id);
    const [organization, waterNames] = await Promise.all([
      this.organizations.findPublicProfile(permit.permitType.organizationId),
      this.waterNames([permit]),
    ]);
    // The type keeps its organization (FK), so the profile always exists.
    return this.toDto(permit, organization?.name ?? '', waterNames);
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
    const holder = await this.users.findById(userId);
    if (!holder) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
    }
    const content = await this.pdfs.render({
      permit,
      holder: {
        firstName: holder.firstName,
        lastName: holder.lastName,
        birthDate: fromDbDate(holder.birthDate),
        anglerCardNo: holder.anglerCardNo,
      },
      waterNames: permit.waters.map((water) => water.name),
      verifyUrl: `${this.webUrl}/verify/${permit.qrToken}`,
      generatedAt: this.clock.now(),
    });
    return { fileName: `${permit.number}.pdf`, content };
  }

  private async find(userId: string, id: string) {
    const permit = await this.prisma.permit.findFirst({
      where: { id, userId },
      include: WITH_TYPE,
    });
    if (!permit) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Permit not found');
    }
    return permit;
  }

  /** Names of the waters of the permits' types, which the permits cover (BR-01). */
  private waterNames(permits: PermitWithType[]): Promise<Map<string, string>> {
    return this.waters.findNames([
      ...new Set(permits.flatMap((permit) => permit.permitType.waters.map((water) => water.id))),
    ]);
  }

  private async toDto(
    permit: PermitWithType,
    organizationName: string,
    waterNames: Map<string, string>,
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
      waters: type.waters
        .map((water) => ({ id: water.id, name: waterNames.get(water.id) ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.id.localeCompare(b.id)),
      createdAt: permit.createdAt.toISOString(),
      qrToken: WITH_QR.has(status) ? await this.qrTokens.sign(permit.id, validTo) : null,
    };
  }
}
