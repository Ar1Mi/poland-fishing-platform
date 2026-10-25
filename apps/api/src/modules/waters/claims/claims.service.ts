import {
  ClaimDecision,
  ClaimStatus,
  ErrorCode,
  isClaimProofMimeType,
  WaterStatus,
} from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { detectFileType } from '../../../common/storage/file-signature';
import { StorageService } from '../../../common/storage/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import { type FishingWater, Prisma, type WaterClaim } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import type { AdminClaimDto, ClaimDto, ReviewClaimDto } from '../dto/claim.dto';

/** Folder of claim documents in StorageService. */
const PROOF_FOLDER = 'claims';

const PROOF_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

type ClaimWithWater = WaterClaim & { water: FishingWater };

/** Claims of catalogue waters by organizations, decided by the super admin (FR-24). */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly organizations: OrganizationsService,
    private readonly clock: ClockService,
    private readonly logger: PinoLogger,
  ) {
    // @InjectPinoLogger would need this file loaded before LoggingModule is declared.
    logger.setContext(ClaimsService.name);
  }

  /** A new PENDING claim of `organizationId` with its proof document. */
  async submit(organizationId: string, fishingWaterId: string, proof: Buffer): Promise<ClaimDto> {
    const water = await this.prisma.fishingWater.findFirst({
      where: { id: fishingWaterId, isPublished: true },
    });
    if (!water) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Water not found');
    }
    if (water.status !== WaterStatus.UNCLAIMED) {
      throw new DomainError(ErrorCode.WATER_ALREADY_CONNECTED);
    }
    const pending = await this.prisma.waterClaim.count({
      where: { fishingWaterId, organizationId, status: ClaimStatus.PENDING },
    });
    if (pending > 0) {
      throw new DomainError(ErrorCode.CLAIM_ALREADY_PENDING);
    }
    // The declared type and the file name are the client's word; the content decides.
    const type = await detectFileType(proof);
    if (!type || !isClaimProofMimeType(type.mime)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { file: 'must be a PDF, JPEG, PNG or WebP file' },
        'Unsupported document type',
      );
    }

    const proofFileKey = await this.storage.save(PROOF_FOLDER, type.ext, proof);
    try {
      const claim = await this.prisma.waterClaim.create({
        data: { fishingWaterId, organizationId, proofFileKey },
        include: { water: true },
      });
      return toClaim(claim);
    } catch (error) {
      await this.storage.delete(proofFileKey);
      // Two submissions at once: the partial unique index claim_one_pending decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainError(ErrorCode.CLAIM_ALREADY_PENDING);
      }
      throw error;
    }
  }

  /** Claims of one organization, newest first. */
  async listForOrganization(organizationId: string): Promise<ClaimDto[]> {
    const claims = await this.prisma.waterClaim.findMany({
      where: { organizationId },
      include: { water: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return claims.map(toClaim);
  }

  /** Super admin queue; claims waiting longest come first. */
  async listAll(status?: ClaimStatus): Promise<AdminClaimDto[]> {
    const claims = await this.prisma.waterClaim.findMany({
      where: { status },
      include: { water: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return this.toAdminClaims(claims);
  }

  /**
   * Approval connects the water to the organization and rejects the other PENDING claims of
   * that water; rejection only closes the claim. One transaction with its AuditLog entry.
   */
  async review(id: string, actorId: string, dto: ReviewClaimDto): Promise<AdminClaimDto> {
    const claim = await this.prisma.waterClaim.findUnique({ where: { id } });
    if (!claim) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Claim not found');
    }
    if (claim.status !== ClaimStatus.PENDING) {
      throw new DomainError(ErrorCode.CLAIM_NOT_PENDING, { status: claim.status });
    }
    const reviewed = {
      reviewedById: actorId,
      reviewedAt: this.clock.now(),
    };
    const comment = dto.comment || null;
    const approve = dto.decision === ClaimDecision.APPROVE;
    const status = approve ? ClaimStatus.APPROVED : ClaimStatus.REJECTED;

    await this.prisma.$transaction(async (tx) => {
      let rejectedClaimIds: string[] = [];
      if (approve) {
        // The water row is locked first: a concurrent approval of another claim of this water
        // waits here and then sees CONNECTED, instead of deadlocking on the claim rows.
        const connected = await tx.fishingWater.updateMany({
          where: { id: claim.fishingWaterId, status: WaterStatus.UNCLAIMED },
          data: { status: WaterStatus.CONNECTED, organizationId: claim.organizationId },
        });
        if (connected.count === 0) {
          throw new DomainError(ErrorCode.WATER_ALREADY_CONNECTED);
        }
      }
      await this.closePending(tx, id, { status, comment, ...reviewed });
      if (approve) {
        // This claim is no longer PENDING, so only the rivals of other organizations match.
        const rejected = await tx.waterClaim.updateManyAndReturn({
          where: { fishingWaterId: claim.fishingWaterId, status: ClaimStatus.PENDING },
          data: { status: ClaimStatus.REJECTED, ...reviewed },
          select: { id: true },
        });
        rejectedClaimIds = rejected.map((other) => other.id);
      }
      await this.audit.record(tx, {
        actorId,
        action: approve ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED',
        entity: 'WaterClaim',
        entityId: id,
        diff: {
          status: { from: ClaimStatus.PENDING, to: status },
          fishingWaterId: claim.fishingWaterId,
          organizationId: claim.organizationId,
          comment,
          ...(approve ? { rejectedClaimIds } : {}),
        },
      });
    });
    this.logger.info(
      { claimId: id, decision: dto.decision, fishingWaterId: claim.fishingWaterId },
      'Claim reviewed',
    );

    const updated = await this.prisma.waterClaim.findUniqueOrThrow({
      where: { id },
      include: { water: true },
    });
    const [result] = await this.toAdminClaims([updated]);
    return result!;
  }

  /** The proof document of a claim, for the super admin. */
  async readDocument(id: string): Promise<{ content: Buffer; type: string; fileName: string }> {
    const claim = await this.prisma.waterClaim.findUnique({ where: { id } });
    if (!claim) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'Claim not found');
    }
    const extension = extensionOf(claim.proofFileKey);
    return {
      content: await this.storage.read(claim.proofFileKey),
      type: documentTypeOf(claim.proofFileKey),
      fileName: `claim-${claim.id}.${extension}`,
    };
  }

  /** Concurrently reviewed (the other decision won) → CLAIM_NOT_PENDING, rolling back. */
  private async closePending(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.WaterClaimUpdateManyMutationInput,
  ): Promise<void> {
    const closed = await tx.waterClaim.updateMany({
      where: { id, status: ClaimStatus.PENDING },
      data,
    });
    if (closed.count === 0) {
      const current = await tx.waterClaim.findUniqueOrThrow({ where: { id } });
      throw new DomainError(ErrorCode.CLAIM_NOT_PENDING, { status: current.status });
    }
  }

  private async toAdminClaims(claims: ClaimWithWater[]): Promise<AdminClaimDto[]> {
    const organizations = await this.organizations.findSummaries([
      ...new Set(claims.map((claim) => claim.organizationId)),
    ]);
    return claims.map((claim) => {
      const organization = organizations.get(claim.organizationId);
      if (!organization) {
        // WaterClaim.organizationId is a foreign key: the organization exists.
        throw new Error(`Organization ${claim.organizationId} of claim ${claim.id} not found`);
      }
      return {
        ...toClaim(claim),
        organization,
        documentType: documentTypeOf(claim.proofFileKey),
      };
    });
  }
}

function toClaim(claim: ClaimWithWater): ClaimDto {
  const { water } = claim;
  return {
    id: claim.id,
    status: claim.status,
    water: { id: water.id, name: water.name, region: water.region, status: water.status },
    comment: claim.comment,
    createdAt: claim.createdAt.toISOString(),
    reviewedAt: claim.reviewedAt?.toISOString() ?? null,
  };
}

function extensionOf(key: string): string {
  return key.slice(key.lastIndexOf('.') + 1);
}

function documentTypeOf(key: string): string {
  return PROOF_TYPE_BY_EXTENSION[extensionOf(key)] ?? 'application/octet-stream';
}
