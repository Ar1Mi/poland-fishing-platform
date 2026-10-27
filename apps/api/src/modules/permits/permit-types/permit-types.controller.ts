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
  Query,
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
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser, Public } from '../../auth/decorators/auth.decorators';
import { Roles } from '../../organizations/decorators/org-access.decorators';
import {
  CreatePermitTypeDto,
  ListPermitTypesQueryDto,
  LowestPriceDto,
  LowestPricesQueryDto,
  OrgPermitTypeDto,
  PermitTypeDto,
  UpdatePermitTypeDto,
} from '../dto/permit-type.dto';
import { PermitTypesService } from './permit-types.service';

const error = { type: ErrorResponseDto };

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/permit-types')
export class OrgPermitTypesController {
  constructor(private readonly permitTypes: PermitTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Permit types of the organization, active first' })
  @ApiOkResponse({ type: OrgPermitTypeDto, isArray: true })
  list(@Param('orgId') orgId: string): Promise<OrgPermitTypeDto[]> {
    return this.permitTypes.listForOrganization(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'New permit type for waters connected to the organization' })
  @ApiCreatedResponse({ type: OrgPermitTypeDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (also a water not connected to the organization)',
  })
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePermitTypeDto,
  ): Promise<OrgPermitTypeDto> {
    return this.permitTypes.create(orgId, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One permit type of the organization' })
  @ApiOkResponse({ type: OrgPermitTypeDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a type of another organization)' })
  get(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrgPermitTypeDto> {
    return this.permitTypes.get(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a permit type; terms of a sold one (duration, discount, waters) are fixed',
  })
  @ApiOkResponse({ type: OrgPermitTypeDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (also a water not connected to the organization)',
  })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a type of another organization)' })
  @ApiConflictResponse({
    ...error,
    description: 'PERMIT_TYPE_IN_USE (details.lockedFields: terms changed on a sold type)',
  })
  update(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePermitTypeDto,
  ): Promise<OrgPermitTypeDto> {
    return this.permitTypes.update(orgId, user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a permit type nobody has bought' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a type of another organization)' })
  @ApiConflictResponse({ ...error, description: 'PERMIT_TYPE_IN_USE (deactivate it instead)' })
  remove(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.permitTypes.remove(orgId, user.id, id);
  }
}

@ApiTags('permits')
@Public()
@Controller('permit-types')
export class PermitTypesController {
  constructor(private readonly permitTypes: PermitTypesService) {}

  @Get()
  @ApiOperation({
    summary: 'Permit types on sale for a water (empty while it is not connected or sales stop)',
  })
  @ApiOkResponse({ type: PermitTypeDto, isArray: true })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (water)' })
  list(@Query() query: ListPermitTypesQueryDto): Promise<PermitTypeDto[]> {
    return this.permitTypes.listForWater(query.waterId);
  }

  @Get('lowest-prices')
  @ApiOperation({ summary: 'Lowest regular price per water, for the «od» price of the list' })
  @ApiOkResponse({ type: LowestPriceDto, isArray: true })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  lowestPrices(@Query() query: LowestPricesQueryDto): Promise<LowestPriceDto[]> {
    return this.permitTypes.lowestPrices(query.waterIds);
  }
}
