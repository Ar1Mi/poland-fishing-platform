import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OrgScopeGuard } from './guards/org-scope.guard';
import { RolesGuard } from './guards/roles.guard';
import { OrgAccessService } from './org-access.service';
import { AdminOrganizationsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Modules with `/orgs/:orgId/*` routes import this one: the guards are resolved in the
 * importing module, so it needs OrgAccessService (and the guards) from here.
 */
@Module({
  imports: [UsersModule],
  controllers: [OrganizationsController, AdminOrganizationsController],
  providers: [OrganizationsService, OrgAccessService, RolesGuard, OrgScopeGuard],
  exports: [OrganizationsService, OrgAccessService, RolesGuard, OrgScopeGuard],
})
export class OrganizationsModule {}
