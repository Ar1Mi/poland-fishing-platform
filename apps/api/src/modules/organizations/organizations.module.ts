import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { OrgScopeGuard } from './guards/org-scope.guard';
import { RolesGuard } from './guards/roles.guard';
import { InvitationsService } from './members/invitations.service';
import {
  InvitationsController,
  OrgInvitationsController,
  OrgMembersController,
} from './members/members.controller';
import { MembersService } from './members/members.service';
import { OrgAccessService } from './org-access.service';
import { AdminOrganizationsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Organizations (T-08), their members and invitations (T-23). Modules with `/orgs/:orgId/*`
 * routes import this one: the guards are resolved in the importing module, so it needs
 * OrgAccessService (and the guards) from here.
 */
@Module({
  imports: [UsersModule, AuditModule, NotificationsModule],
  controllers: [
    OrganizationsController,
    AdminOrganizationsController,
    OrgMembersController,
    OrgInvitationsController,
    InvitationsController,
  ],
  providers: [
    OrganizationsService,
    OrgAccessService,
    MembersService,
    InvitationsService,
    RolesGuard,
    OrgScopeGuard,
  ],
  exports: [OrganizationsService, OrgAccessService, RolesGuard, OrgScopeGuard],
})
export class OrganizationsModule {}
