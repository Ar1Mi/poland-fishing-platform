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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { Roles } from '../decorators/org-access.decorators';
import {
  AcceptedInvitationDto,
  AcceptInvitationDto,
  CreateInvitationDto,
  InvitationDto,
  MemberDto,
  UpdateMemberRolesDto,
} from '../dto/member.dto';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';

const error = { type: ErrorResponseDto };
const badId = { ...error, description: 'VALIDATION_FAILED (id is not a UUID)' };
const orgAccess = {
  ...error,
  description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN',
};

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse(orgAccess)
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/members')
export class OrgMembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Members of the organization with their roles, by last name' })
  @ApiOkResponse({ type: MemberDto, isArray: true })
  list(@Param('orgId') orgId: string): Promise<MemberDto[]> {
    return this.members.list(orgId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Set every role the member keeps' })
  @ApiOkResponse({ type: MemberDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a member)' })
  @ApiConflictResponse({ ...error, description: 'LAST_ORG_ADMIN' })
  setRoles(
    @Param('orgId') orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMemberRolesDto,
  ): Promise<MemberDto> {
    return this.members.setRoles(orgId, user.id, userId, dto.roles);
  }

  @Delete(':userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove the member (every role); the last admin stays' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a member)' })
  @ApiConflictResponse({ ...error, description: 'LAST_ORG_ADMIN' })
  async remove(
    @Param('orgId') orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.members.remove(orgId, user.id, userId);
  }
}

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse(orgAccess)
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/invitations')
export class OrgInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'Invitations not accepted yet (expired included), latest first' })
  @ApiOkResponse({ type: InvitationDto, isArray: true })
  list(@Param('orgId') orgId: string): Promise<InvitationDto[]> {
    return this.invitations.listPending(orgId);
  }

  @Post()
  @ApiOperation({
    summary: 'Invite by email; replaces a pending invitation of the same address and role',
  })
  @ApiCreatedResponse({ type: InvitationDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ ...error, description: 'ALREADY_MEMBER (details.role)' })
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationDto> {
    return this.invitations.create(orgId, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel a pending invitation: its link stops working' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (unknown or accepted)' })
  async cancel(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.invitations.cancel(orgId, user.id, id);
  }
}

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an invitation with the token of its link (FR-04)' })
  @ApiOkResponse({ type: AcceptedInvitationDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED, INVALID_TOKEN (unknown, cancelled, replaced or used)',
  })
  @ApiForbiddenResponse({
    ...error,
    description: 'INVITATION_EMAIL_MISMATCH (logged in to another account)',
  })
  @ApiUnprocessableEntityResponse({ ...error, description: 'INVITATION_EXPIRED' })
  accept(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptInvitationDto,
  ): Promise<AcceptedInvitationDto> {
    return this.invitations.accept(user.id, dto.token);
  }
}
