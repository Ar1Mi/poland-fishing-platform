import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenService } from './access-token.service';
import { AUTH_THROTTLERS } from './auth-throttlers';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OneTimeTokenService } from './one-time-token.service';
import { PasswordHasher } from './password-hasher';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [ThrottlerModule.forRoot([...AUTH_THROTTLERS]), UsersModule, NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenService,
    RefreshTokenService,
    OneTimeTokenService,
    PasswordHasher,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
