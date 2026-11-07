import { OrgRole } from '@lowisko/shared';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { Roles } from '../../organizations/decorators/org-access.decorators';
import {
  ListOrgPermitsQueryDto,
  OrgPermitDto,
  OrgPermitPageDto,
  RevokePermitDto,
} from '../dto/org-permit.dto';
import { OrgPermitsService } from './org-permits.service';

const error = { type: ErrorResponseDto };

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/permits')
export class OrgPermitsController {
  constructor(private readonly permits: OrgPermitsService) {}

  @Get()
  @ApiOperation({ summary: 'Permits sold by the organization (paid or revoked), paginated' })
  @ApiOkResponse({ type: OrgPermitPageDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  list(
    @Param('orgId') orgId: string,
    @Query() query: ListOrgPermitsQueryDto,
  ): Promise<OrgPermitPageDto> {
    return this.permits.list(orgId, query);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a scheduled or active permit (FR-10); the reason is required' })
  @ApiOkResponse({ type: OrgPermitDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a permit of the organization)' })
  @ApiUnprocessableEntityResponse({
    ...error,
    description: 'PERMIT_NOT_REVOCABLE (details.status: expired, revoked, not paid)',
  })
  revoke(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RevokePermitDto,
  ): Promise<OrgPermitDto> {
    return this.permits.revoke(orgId, user.id, id, dto.reason);
  }
}
