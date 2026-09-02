import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthHashService } from './auth-hash.service';
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
    AuthSessionService,
    AuthTokenService,
  ],
  exports: [
    AUTH_RUNTIME_CONFIG,
    AuthHashService,
    AuthSessionService,
    AuthTokenService,
  ],
})
export class AuthModule {}
