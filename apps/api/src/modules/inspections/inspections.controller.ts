import { OrgRole } from '@lowisko/shared';
import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import {
  type AuthUser,
  CurrentUser,
  OptionalAuth,
  OptionalUser,
} from '../auth/decorators/auth.decorators';
import { Roles } from '../organizations/decorators/org-access.decorators';
import {
  CreateInspectionDto,
  InspectionDto,
  InspectionsQueryDto,
  VerificationDto,
} from './dto/inspection.dto';
import { InspectionsService } from './inspections.service';

const error = { type: ErrorResponseDto };

// Personal data, and an answer that depends on the token sent: no copy in any cache.
const NO_STORE = ['Cache-Control', 'no-store'] as const;

@ApiTags('inspections')
@Controller('verify')
export class VerifyController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get(':token')
  @OptionalAuth()
  @Header(...NO_STORE)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Check a permit by its QR token (ADR-0006): public validity, type, term and initials; ' +
      'the holder and today’s catches for an inspector or admin of the issuing organization',
  })
  @ApiOkResponse({ type: VerificationDto, description: 'Also for a token that is not genuine' })
  @ApiUnauthorizedResponse({
    ...error,
    description: 'UNAUTHENTICATED, TOKEN_EXPIRED (only when an access token is sent)',
  })
  verify(
    @Param('token') token: string,
    @OptionalUser() user: AuthUser | undefined,
  ): Promise<VerificationDto> {
    return this.inspections.verify(token, user?.id);
  }
}

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@Controller('orgs/:orgId/inspections')
export class OrgInspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  @Roles(OrgRole.INSPECTOR, OrgRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Save an inspection protocol of a permit of the organization' })
  @ApiCreatedResponse({ type: InspectionDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({
    ...error,
    description: 'NOT_FOUND (also a permit of another organization)',
  })
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInspectionDto,
  ): Promise<InspectionDto> {
    return this.inspections.create(orgId, user.id, dto);
  }

  @Get()
  @Roles(OrgRole.ORG_ADMIN)
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'Protocols of a season, latest first' })
  @ApiOkResponse({ type: [InspectionDto] })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (season)' })
  list(
    @Param('orgId') orgId: string,
    @Query() query: InspectionsQueryDto,
  ): Promise<InspectionDto[]> {
    return this.inspections.list(orgId, query);
  }
}
