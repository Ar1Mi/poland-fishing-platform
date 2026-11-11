import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CatchesModule } from '../catches/catches.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PermitsModule } from '../permits/permits.module';
import { UsersModule } from '../users/users.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

/**
 * RODO export and deletion of the account (T-26, ADR-0016). Imports the modules that own the
 * user's data and is imported by none, so the dependencies stay one-way.
 */
@Module({
  imports: [
    UsersModule,
    AuthModule,
    OrganizationsModule,
    PermitsModule,
    CatchesModule,
    InspectionsModule,
    AuditModule,
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
