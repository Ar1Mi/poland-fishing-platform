import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../auth/decorators/auth.decorators';
import { SuperAdmin } from './decorators/org-access.decorators';
import {
  CreateOrganizationDto,
  ListOrganizationsQueryDto,
  MyOrganizationDto,
  OrganizationDto,
  UpdateOrganizationStatusDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

const error = { type: ErrorResponseDto };

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post('orgs')
  @ApiOperation({ summary: 'Apply to register an organization; the applicant becomes ORG_ADMIN' })
  @ApiCreatedResponse({ type: OrganizationDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ ...error, description: 'NIP_TAKEN' })
  apply(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.organizations.apply(user.id, dto);
  }

  @Get('me/orgs')
  @ApiTags('me')
  @ApiOperation({ summary: 'Organizations of the logged-in user and the roles held in each' })
  @ApiOkResponse({ type: MyOrganizationDto, isArray: true })
  listMine(@CurrentUser() user: AuthUser): Promise<MyOrganizationDto[]> {
    return this.organizations.listForUser(user.id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'FORBIDDEN (not a super admin)' })
@SuperAdmin()
@Controller('admin/orgs')
export class AdminOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'All organizations, oldest application first' })
  @ApiOkResponse({ type: OrganizationDto, isArray: true })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  list(@Query() query: ListOrganizationsQueryDto): Promise<OrganizationDto[]> {
    return this.organizations.listAll(query.status);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or block an organization' })
  @ApiOkResponse({ type: OrganizationDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationStatusDto,
  ): Promise<OrganizationDto> {
    return this.organizations.setStatus(id, dto.status);
  }
}
