import { Controller, Get, Module, VersioningType } from '@nestjs/common';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuthSessionException } from './auth-session.service';
import { AuthModule } from './auth.module';
import {
  AuthGuard,
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from './auth.guard';
import { type AuthPrincipalContext, AuthPrincipalService } from './auth-principal.service';

const staffPrincipal: AuthPrincipalContext = Object.freeze({
  userId: 'user-1',
  sessionId: 'session-1',
  tokenId: 'jti-1',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 60_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['catalog.read', 'catalog.write']),
});

const constituentPrincipal: AuthPrincipalContext = Object.freeze({
  ...staffPrincipal,
  userId: 'user-2',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: new Set<string>(),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string): Promise<AuthPrincipalContext> => {
    if (authorization === 'Bearer staff-token') return staffPrincipal;
    if (authorization === 'Bearer customer-token') return constituentPrincipal;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};

@Controller('principal-test')
class PrincipalTestController {
  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }

  @RequireAuthentication('STAFF_MFA')
  @Get('staff')
  staff(@CurrentPrincipal() principal: AuthPrincipalContext): { userId: string; permissions: string[] } {
    return { userId: principal.userId, permissions: [...principal.permissions] };
  }

  @RequireAuthentication('CUSTOMER_OTP')
  @Get('customer')
  customer(@CurrentPrincipal() principal: AuthPrincipalContext): { userId: string } {
    return { userId: principal.userId };
  }

  @RequirePermission('catalog.write')
  @Get('permission')
  permission(@CurrentPrincipal() principal: AuthPrincipalContext): { granted: boolean } {
    return { granted: principal.permissions.has('catalog.write') };
  }
}

@Module({
  imports: [ApiFoundationModule],
  controllers: [PrincipalTestController],
  providers: [
    { provide: AuthPrincipalService, useValue: principalService },
    { provide: APP_GUARD, useValue: new AuthGuard(principalService as unknown as AuthPrincipalService) },
  ],
})
class PrincipalHttpTestModule {}

describe('AuthGuard HTTP behavior', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(PrincipalHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    principalService.resolveBearerToken.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('leaves metadata-free routes open without resolving a principal', async () => {
    const response = await fetch(`${baseUrl}/api/v1/principal-test/open`);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(principalService.resolveBearerToken).not.toHaveBeenCalled();
  });

  it('resolves the live principal and exposes it to the handler', async () => {
    const response = await fetch(`${baseUrl}/api/v1/principal-test/staff`, {
      headers: { authorization: 'Bearer staff-token' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 'user-1',
      permissions: ['catalog.read', 'catalog.write'],
    });
  });

  it('returns a stable 401 envelope for missing or invalid credentials', async () => {
    const missing = await fetch(`${baseUrl}/api/v1/principal-test/staff`);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('x-request-id')).toBeTruthy();
    const missingBody = (await missing.json()) as { code: string; requestId: string; statusCode: number };
    expect(missingBody).toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
    expect(missingBody.requestId).toBe(missing.headers.get('x-request-id'));

    const invalid = await fetch(`${baseUrl}/api/v1/principal-test/staff`, {
      headers: { authorization: 'Bearer garbage' },
    });
    expect(invalid.status).toBe(401);
    const invalidBody = (await invalid.json()) as { code: string; requestId: string; statusCode: number };
    expect(invalidBody).toMatchObject({
      code: 'AUTH_SESSION_INVALID',
      statusCode: 401,
    });
    expect(invalidBody.requestId).toBeTruthy();
  });

  it('denies a lower authentication level with a stable 403 envelope', async () => {
    const response = await fetch(`${baseUrl}/api/v1/principal-test/staff`, {
      headers: { authorization: 'Bearer customer-token' },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('admits a matching customer authentication level', async () => {
    const response = await fetch(`${baseUrl}/api/v1/principal-test/customer`, {
      headers: { authorization: 'Bearer customer-token' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId: 'user-2' });
  });

  it('denies missing permissions and admits granted ones', async () => {
    const granted = await fetch(`${baseUrl}/api/v1/principal-test/permission`, {
      headers: { authorization: 'Bearer staff-token' },
    });
    expect(granted.status).toBe(200);
    await expect(granted.json()).resolves.toEqual({ granted: true });

    const denied = await fetch(`${baseUrl}/api/v1/principal-test/permission`, {
      headers: { authorization: 'Bearer customer-token' },
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });
});

describe('AuthModule global guard wiring', () => {
  it('registers AuthGuard as the global APP_GUARD using the same provider instance', () => {
    const providers = Reflect.getMetadata('providers', AuthModule) as unknown[];
    const globalGuardProvider = providers.find(
      value =>
        typeof value === 'object' &&
        value !== null &&
        (value as { provide?: unknown }).provide === APP_GUARD,
    );

    expect(globalGuardProvider).toBeDefined();
    expect(globalGuardProvider).toMatchObject({
      provide: APP_GUARD,
      useExisting: AuthGuard,
    });
  });

  it('keeps the guard decorators and AuthGuard as ordinary exports, not Nest runtime exports', () => {
    expect(typeof CurrentPrincipal).toBe('function');
    expect(typeof RequireAuthentication).toBe('function');
    expect(typeof RequirePermission).toBe('function');

    const exportsMetadata = Reflect.getMetadata('exports', AuthModule) as unknown[];
    const exportedTokens = exportsMetadata.filter(value => typeof value !== 'string' && value === AuthGuard);
    expect(exportedTokens).toHaveLength(1);
  });
});