import { OrgRole } from '@lowisko/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { Roles, SuperAdmin } from '../organizations/decorators/org-access.decorators';
import {
  CreateGeneralRuleDto,
  CreateOrgRuleDto,
  EffectiveRuleDto,
  SpeciesRuleDto,
  UpdateSpeciesRuleDto,
} from './dto/species-rule.dto';
import { type RuleScope, SpeciesRulesService } from './species-rules.service';

const error = { type: ErrorResponseDto };
const general: RuleScope = { kind: 'general' };
const ofOrganization = (organizationId: string): RuleScope => ({
  kind: 'organization',
  organizationId,
});
const invalidParameters =
  'VALIDATION_FAILED (also nothing restricted, half a closed period, unknown species)';

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'FORBIDDEN (not a super admin)' })
@SuperAdmin()
@Controller('admin/rules')
export class AdminRulesController {
  constructor(private readonly rules: SpeciesRulesService) {}

  @Get()
  @ApiOperation({ summary: 'General rules (from the rozporządzenie), by species name' })
  @ApiOkResponse({ type: SpeciesRuleDto, isArray: true })
  list(): Promise<SpeciesRuleDto[]> {
    return this.rules.list(general);
  }

  @Post()
  @ApiOperation({ summary: 'General rule of a species without one' })
  @ApiCreatedResponse({ type: SpeciesRuleDto })
  @ApiBadRequestResponse({ ...error, description: invalidParameters })
  @ApiConflictResponse({ ...error, description: 'RULE_ALREADY_EXISTS (one per species)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateGeneralRuleDto,
  ): Promise<SpeciesRuleDto> {
    return this.rules.create(general, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One general rule' })
  @ApiOkResponse({ type: SpeciesRuleDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a rule of an organization)' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SpeciesRuleDto> {
    return this.rules.get(general, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change parameters of a general rule; null removes one' })
  @ApiOkResponse({ type: SpeciesRuleDto })
  @ApiBadRequestResponse({ ...error, description: invalidParameters })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a rule of an organization)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSpeciesRuleDto,
  ): Promise<SpeciesRuleDto> {
    return this.rules.update(general, user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a general rule' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a rule of an organization)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.rules.remove(general, user.id, id);
  }
}

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/rules')
export class OrgRulesController {
  constructor(private readonly rules: SpeciesRulesService) {}

  @Get()
  @ApiOperation({
    summary: 'Rules of the organization and of its waters, by species name',
  })
  @ApiOkResponse({ type: SpeciesRuleDto, isArray: true })
  list(@Param('orgId') orgId: string): Promise<SpeciesRuleDto[]> {
    return this.rules.list(ofOrganization(orgId));
  }

  @Post()
  @ApiOperation({ summary: 'Rule of the organization or of one of its connected waters' })
  @ApiCreatedResponse({ type: SpeciesRuleDto })
  @ApiBadRequestResponse({
    ...error,
    description: `${invalidParameters}, a water not connected to the organization`,
  })
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrgRuleDto,
  ): Promise<SpeciesRuleDto> {
    return this.rules.create(ofOrganization(orgId), user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One rule of the organization' })
  @ApiOkResponse({ type: SpeciesRuleDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a rule of another level)' })
  get(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SpeciesRuleDto> {
    return this.rules.get(ofOrganization(orgId), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change parameters of a rule; null removes one' })
  @ApiOkResponse({ type: SpeciesRuleDto })
  @ApiBadRequestResponse({ ...error, description: invalidParameters })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a rule of another level)' })
  update(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSpeciesRuleDto,
  ): Promise<SpeciesRuleDto> {
    return this.rules.update(ofOrganization(orgId), user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a rule of the organization' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a rule of another level)' })
  remove(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.rules.remove(ofOrganization(orgId), user.id, id);
  }
}

@ApiTags('waters')
@Public()
@Controller('waters/:id/rules')
export class WaterRulesController {
  constructor(private readonly rules: SpeciesRulesService) {}

  @Get()
  @ApiOperation({
    summary: 'Effective rules of the water per species: the strictest of every level',
  })
  @ApiOkResponse({ type: EffectiveRuleDto, isArray: true })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also an unpublished water)' })
  list(@Param('id', ParseUUIDPipe) id: string): Promise<EffectiveRuleDto[]> {
    return this.rules.effectiveForWater(id);
  }
}
