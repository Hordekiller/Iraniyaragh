import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthPermissionService } from './auth-permission.service';
import { AuthGuard } from './auth.guard';
import { AuthHashService } from './auth-hash.service';
import { AuthPrincipalService } from './auth-principal.service';
import { AUTH_RUNTIME_CONFIG, createAuthRuntimeConfig } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { PasswordHashService } from './password-hash.service';
import { CustomerAuthController } from './customer-otp.controller';
import { CustomerOtpService } from './customer-otp.service';
import { RateLimitService } from './rate-limit.service';
import { SessionManagementController } from './session.controller';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffMfaService } from './staff-mfa.service';
import { TotpCryptoService } from './totp-crypto.service';
import { SmsTransportModule } from '../notifications/sms-transport.module';

@Module({
  imports: [SmsTransportModule],
  controllers: [StaffAuthController, CustomerAuthController, SessionManagementController],
  providers: [
    {
      provide: AUTH_RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: createAuthRuntimeConfig,
    },
    AuthHashService,
    AuthTokenService,
    PasswordHashService,
    StaffAuthService,
    StaffMfaService,
    TotpCryptoService,
    AuthPermissionService,
    AuthPrincipalService,
    AuthSessionService,
    CustomerOtpService,
    RateLimitService,
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [
    AUTH_RUNTIME_CONFIG,
    AuthHashService,
    AuthTokenService,
    AuthPermissionService,
    AuthPrincipalService,
    AuthSessionService,
    CustomerOtpService,
    RateLimitService,
    AuthGuard,
  ],
})
export class AuthModule {}
