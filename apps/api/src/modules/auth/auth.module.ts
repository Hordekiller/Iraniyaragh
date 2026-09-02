import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPermissionService } from './auth-permission.service';
import { AuthGuard } from './auth.guard';
import { AuthHashService } from './auth-hash.service';
import { AuthPrincipalService } from './auth-principal.service';
import { AUTH_RUNTIME_CONFIG, createAuthRuntimeConfig } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';

@Module({
  providers: [
    {
      provide: AUTH_RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: createAuthRuntimeConfig,
    },
    AuthHashService,
    AuthTokenService,
    AuthPermissionService,
    AuthPrincipalService,
    AuthSessionService,
    AuthGuard,
  ],
  exports: [
    AUTH_RUNTIME_CONFIG,
    AuthHashService,
    AuthTokenService,
    AuthPermissionService,
    AuthPrincipalService,
    AuthSessionService,
    AuthGuard,
  ],
})
export class AuthModule {}
