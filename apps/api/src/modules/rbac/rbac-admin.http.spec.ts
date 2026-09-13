import 'reflect-metadata';

import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import { type AuthPrincipalContext, AuthPrincipalService } from '../auth/auth-principal.service';
import { RbacAdminController } from './rbac-admin.controller';
import { RbacAdminService } from './rbac-admin.service';

const freshStaffPrincipal = Object.freeze({
  userId: 'staff-fresh',
  sessionId: 'session-fresh',
  tokenId: 'jti-fresh',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['users.manage', 'roles.manage']),
}) as AuthPrincipalContext;

const staffWithoutRolePermission: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'staff-no-roles',
  permissions: new Set(['users.manage']),
});

const staffWithoutUserPermission: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'staff-no-users',
  permissions: new Set(['roles.manage']),
});

const customerPrincipal: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'customer-1',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: new Set<string>(),
});

const staleStaffPrincipal: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'staff-stale',
  authenticatedAt: new Date(Date.now() - 6 * 60 * 1_000),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string): Promise<AuthPrincipalContext> => {
    if (authorization === 'Bearer staff-fresh') return freshStaffPrincipal;
    if (authorization === 'Bearer staff-no-roles') return staffWithoutRolePermission;
    if (authorization === 'Bearer staff-no-users') return staffWithoutUserPermission;
    if (authorization === 'Bearer customer') return customerPrincipal;
    if (authorization === 'Bearer staff-stale') return staleStaffPrincipal;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};

const roleFixture = (id: string) => ({
  id,
  key: `role-${id}`,
  name: `Role ${id}`,
  description: null,
  isSystem: id === 'sys',
  isActive: true,
  permissionKeys: ['catalog.read'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const assignmentFixture = () => ({
  assignmentId: 'userRole_1',
  roleId: 'role_1',
  roleKey: 'role-1',
  roleName: 'Role 1',
  roleDescription: null,
  isSystem: false,
  assignedAt: '2026-01-01T00:00:00.000Z',
  assignedById: 'staff-fresh',
  expiresAt: null,
  revokedAt: null,
  revokeReason: null,
});

function createServiceStub() {
  return {
    listStaff: vi.fn(async () => ({
      data: { items: [], total: 0, cursor: null },
    })),
    getStaffDetail: vi.fn(async () => ({
      data: {
        staff: {
          userId: 'user_1',
          email: 'staff@example.com',
          mobile: null,
          name: 'Staff One',
          status: 'ACTIVE',
          activeRoleCount: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          activeGrants: [assignmentFixture()],
          effectivePermissionKeys: ['catalog.read'],
        },
      },
    })),
    listRoles: vi.fn(async () => ({ data: { items: [roleFixture('sys')] } })),
    getRole: vi.fn(async () => ({ data: { role: roleFixture('1') } })),
    previewRoleDeactivation: vi.fn(async () => ({
      data: {
        role: { roleId: 'role_1', roleKey: 'role-1', name: 'Role 1', isSystem: false },
        deactivation: { totalActiveAssignments: 0, users: [] },
      },
    })),
    createRole: vi.fn(async () => ({ data: { role: roleFixture('created') } })),
    updateRole: vi.fn(async () => ({ data: { role: roleFixture('updated') } })),
    listPermissions: vi.fn(async () => ({ data: { items: [] } })),
    togglePermission: vi.fn(async () => ({
      data: {
        permission: {
          id: 'perm_1',
          key: 'catalog.read',
          name: 'Read Catalog',
          description: null,
          group: 'catalog',
          isActive: true,
        },
      },
    })),
    listSoDRestrictions: vi.fn(async () => ({ data: { items: [] } })),
    grantRole: vi.fn(async () => ({ data: { assignment: assignmentFixture() } })),
    revokeRole: vi.fn(async () => ({ data: { assignment: null, changed: false } })),
  } as unknown as RbacAdminService;
}

const serviceStub = createServiceStub();

@Module({
  imports: [ApiFoundationModule],
  controllers: [RbacAdminController],
  providers: [
    { provide: RbacAdminService, useValue: serviceStub },
    { provide: AuthPrincipalService, useValue: principalService },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    { provide: APP_GUARD, useValue: new AuthGuard(principalService as unknown as AuthPrincipalService) },
  ],
})
// Route-level evidence harness (see settings.admin.http.spec.ts). It boots a
// dedicated Nest test module importing ApiFoundationModule with a real AuthGuard
// over a stubbed AuthPrincipalService and RbacAdminService; it is NOT the real
// AppModule, so wiring beyond this controller is not exercised here.
class RbacAdminHttpTestModule {}

describe('RbacAdminController HTTP authorization', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(RbacAdminHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    principalService.resolveBearerToken.mockClear();
    Object.values(serviceStub).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const threads: ReadonlyArray<{ label: string; method: string; path: string; bearer?: string }> = [
    { label: 'list staff', method: 'GET', path: '/api/v1/rbac/admin/staff' },
    { label: 'read one staff member', method: 'GET', path: '/api/v1/rbac/admin/staff/user_1' },
  ];

  const reads: ReadonlyArray<{ label: string; method: string; path: string; bearer?: string }> = [
    ...threads,
    { label: 'list roles', method: 'GET', path: '/api/v1/rbac/admin/roles' },
    { label: 'read one role', method: 'GET', path: '/api/v1/rbac/admin/roles/role_1' },
    { label: 'preview a role deactivation', method: 'GET', path: '/api/v1/rbac/admin/roles/role_1/impact' },
    { label: 'list permissions', method: 'GET', path: '/api/v1/rbac/admin/permissions' },
    { label: 'list SoD restrictions', method: 'GET', path: '/api/v1/rbac/admin/sod-restrictions' },
  ];

  const roleReads: ReadonlyArray<{ label: string; method: string; path: string; bearer?: string }> = reads.slice(threads.length);

  const roleMutations: ReadonlyArray<{ label: string; method: string; path: string; body?: object }> = [
    { label: 'create a role', method: 'POST', path: '/api/v1/rbac/admin/roles', body: { key: 'warehouse-manager', name: 'Warehouse Manager' } },
    { label: 'update a role', method: 'PATCH', path: '/api/v1/rbac/admin/roles/role_1', body: { name: 'Renamed' } },
    { label: 'toggle a permission', method: 'PATCH', path: '/api/v1/rbac/admin/permissions/perm_1', body: { isActive: false } },
  ];

  const userMutations: ReadonlyArray<{ label: string; method: string; path: string; body?: object }> = [
    { label: 'grant a role', method: 'POST', path: '/api/v1/rbac/admin/staff/user_1/grants', body: { roleId: 'role_1' } },
    { label: 'revoke a role', method: 'POST', path: '/api/v1/rbac/admin/staff/user_1/grants/role_1/revoke', body: { revokeReason: 'Cover ended' } },
  ];

  it.each([...reads, ...roleMutations, ...userMutations])('denies $label without credentials (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(401);
    const responseBody = (await response.json()) as { code: string; requestId: string };
    expect(responseBody).toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(responseBody.requestId).toBe(response.headers.get('x-request-id'));
  });

  it.each([...reads, ...roleMutations, ...userMutations])('denies $label with an invalid token (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer garbage', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
  });

  it.each([...reads, ...roleMutations, ...userMutations])('denies $label to a customer-level principal (403)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer customer', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each([...roleReads, ...roleMutations])('denies $label to staff without roles.manage (403)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-no-roles', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each([...threads, ...userMutations])('denies $label to staff without users.manage (403)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-no-users', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each([...roleMutations, ...userMutations])('requires fresh authentication for $label (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-stale', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTH_REAUTHENTICATION_REQUIRED',
      statusCode: 401,
    });
  });

  it.each(reads)('permits $label for authorized staff (200)', async ({ method, path }) => {
    const response = await fetch(baseUrl + path, { method, headers: { authorization: 'Bearer staff-fresh' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it.each(roleMutations)('permits $label for fresh staff with roles.manage', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect([200, 201]).toContain(response.status);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it.each(userMutations)('permits $label for fresh staff with users.manage', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect([200, 201]).toContain(response.status);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('propagates the actor and request id into the grant service context', async () => {
    const response = await fetch(baseUrl + '/api/v1/rbac/admin/staff/user_1/grants', {
      method: 'POST',
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: JSON.stringify({ roleId: 'role_1' }),
    });
    expect([200, 201]).toContain(response.status);
    const [context] = serviceStub.grantRole.mock.calls[0] as [{ actorUserId: string; requestId: string }];
    expect(context).toMatchObject({ actorUserId: 'staff-fresh' });
    expect(context.requestId).toBeTruthy();
  });
});