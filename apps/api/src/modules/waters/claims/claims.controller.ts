import { CLAIM_PROOF_MAX_BYTES, ErrorCode, OrgRole } from '@lowisko/shared';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../../common/errors/domain-error';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { Roles, SuperAdmin } from '../../organizations/decorators/org-access.decorators';
import {
  AdminClaimDto,
  ClaimDto,
  CreateClaimDto,
  ListClaimsQueryDto,
  ReviewClaimDto,
} from '../dto/claim.dto';
import { ClaimsService } from './claims.service';

const error = { type: ErrorResponseDto };

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/claims')
export class OrgClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CLAIM_PROOF_MAX_BYTES, files: 1, fields: 1, parts: 2 },
    }),
  )
  @ApiOperation({
    summary: 'Claim a catalogue water with a proof document (PDF, JPEG, PNG or WebP, up to 5 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fishingWaterId', 'file'],
      properties: {
        fishingWaterId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary', description: 'Proof of the right to the water' },
      },
    },
  })
  @ApiCreatedResponse({ type: ClaimDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (no file, unsupported document type, bad fishingWaterId)',
  })
  @ApiPayloadTooLargeResponse({ ...error, description: 'VALIDATION_FAILED (file over 5 MB)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (water)' })
  @ApiConflictResponse({ ...error, description: 'WATER_ALREADY_CONNECTED, CLAIM_ALREADY_PENDING' })
  submit(
    @Param('orgId') orgId: string,
    @Body() dto: CreateClaimDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ClaimDto> {
    if (!file) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file is required'] } },
        'Proof document is required',
      );
    }
    return this.claims.submit(orgId, dto.fishingWaterId, file.buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Claims of the organization, newest first' })
  @ApiOkResponse({ type: ClaimDto, isArray: true })
  list(@Param('orgId') orgId: string): Promise<ClaimDto[]> {
    return this.claims.listForOrganization(orgId);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'FORBIDDEN (not a super admin)' })
@SuperAdmin()
@Controller('admin/claims')
export class AdminClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get()
  @ApiOperation({ summary: 'All claims, oldest first' })
  @ApiOkResponse({ type: AdminClaimDto, isArray: true })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  list(@Query() query: ListClaimsQueryDto): Promise<AdminClaimDto[]> {
    return this.claims.listAll(query.status);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Approve (the water becomes CONNECTED, other pending claims of it are rejected) or reject',
  })
  @ApiOkResponse({ type: AdminClaimDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND' })
  @ApiForbiddenResponse({
    ...error,
    description:
      'FORBIDDEN (not a super admin), ORG_NOT_ACTIVE (approving for an inactive organization)',
  })
  @ApiConflictResponse({ ...error, description: 'CLAIM_NOT_PENDING, WATER_ALREADY_CONNECTED' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewClaimDto,
  ): Promise<AdminClaimDto> {
    return this.claims.review(id, user.id, dto);
  }

  @Get(':id/document')
  // A personal document fetched with a token: no copy in browser or proxy caches.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Proof document of the claim, as an attachment' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (claim or its stored file)' })
  async document(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { content, type, fileName } = await this.claims.readDocument(id);
    // Never rendered inline: an uploaded file is not trusted content of our origin.
    return new StreamableFile(content, { type, disposition: `attachment; filename="${fileName}"` });
  }
}
