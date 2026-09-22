import 'reflect-metadata';

import { Module, VersioningType } from '@nestjs/common';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import {
  AuthPrincipalService,
  type AuthPrincipalContext,
} from '../auth/auth-principal.service';
import { OrderCommandController } from './order-command.controller';
import { OrderCommandService } from './order-command.service';

const basePrincipal = {
  sessionId: 'session-order-command-http',
  tokenId: 'token-order-command-http',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};

const customerPrincipal: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: 'customer-user-command',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: new Set<string>(),
});

const staffPrincipal: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: 'staff-user-command',
  authenticationLevel: 'STAFF_MFA',
  permissions: new Set(['orders.manage']),
});

const staffWithoutPermission: AuthPrincipalContext = Object.freeze({
  ...staffPrincipal,
  userId: 'staff-without-orders-manage',
  permissions: new Set(['orders.read']),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    if (authorization === 'Bearer customer') return customerPrincipal;
    if (authorization === 'Bearer staff') return staffPrincipal;
    if (authorization === 'Bearer staff-without-permission') {
      return staffWithoutPermission;
    }
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};

const commandService = {
  cancelAsCustomer: vi.fn(async (_userId: string, id: string, _opts: unknown) => ({
    data: { order: { id, status: 'CANCELLED' } },
  })),
  cancelAsStaff: vi.fn(async (_userId: string, id: string, _opts: unknown) => ({
    data: { order: { id, status: 'CANCELLED' } },
  })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [OrderCommandController],
  providers: [
    { provide: OrderCommandService, useValue: commandService },
    { provide: AuthPrincipalService, useValue: principalService },
    {
      provide: APP_GUARD,
      useValue: new AuthGuard(
        principalService as unknown as AuthPrincipalService,
        { record: vi.fn(async () => undefined) } as unknown as AuditLogService,
      ),
    },
  ],
})
class OrderCommandHttpTestModule {}

describe('OrderCommandController HTTP authorization', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(OrderCommandHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a customer cancel an owned order with the class-scoped identity', async () => {
    const response = await request(
      '/api/v1/orders/order-1/cancel',
      'customer',
      'customer-key-1',
    );
    expect(response.status, await response.clone().text()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { order: { id: 'order-1', status: 'CANCELLED' } },
    });
    expect(commandService.cancelAsCustomer).toHaveBeenCalledWith(
      customerPrincipal.userId,
      'order-1',
      expect.objectContaining({ idempotencyKey: 'customer-key-1' }),
    );
  });

  it('requires an authenticated session for cancel', async () => {
    const response = await fetch(baseUrl + '/api/v1/orders/order-1/cancel', {
      method: 'POST',
      headers: { 'idempotency-key': 'anon-key' },
    });
    expect(response.status).toBe(401);
    expect(commandService.cancelAsCustomer).not.toHaveBeenCalled();
  });

  it('keeps customer-owned routes closed to staff tokens', async () => {
    const response = await request(
      '/api/v1/orders/order-1/cancel',
      'staff',
      'staff-key-1',
    );
    expect(response.status).toBe(403);
    expect(commandService.cancelAsCustomer).not.toHaveBeenCalled();
  });

  it('requires staff MFA plus orders.manage for admin cancel', async () => {
    const missing = await fetch(baseUrl + '/api/v1/orders/admin/order-1/cancel', {
      method: 'POST',
      headers: { 'idempotency-key': 'admin-key' },
    });
    expect(missing.status).toBe(401);

    const customer = await request(
      '/api/v1/orders/admin/order-1/cancel',
      'customer',
      'admin-key',
    );
    expect(customer.status).toBe(403);

    const unprivileged = await request(
      '/api/v1/orders/admin/order-1/cancel',
      'staff-without-permission',
      'admin-key',
    );
    expect(unprivileged.status).toBe(403);
    expect(commandService.cancelAsStaff).not.toHaveBeenCalled();

    const allowed = await request(
      '/api/v1/orders/admin/order-1/cancel',
      'staff',
      'admin-key',
    );
    expect(allowed.status, await allowed.clone().text()).toBe(200);
    expect(commandService.cancelAsStaff).toHaveBeenCalledWith(
      staffPrincipal.userId,
      'order-1',
      expect.objectContaining({ idempotencyKey: 'admin-key' }),
    );
  });

  it('rejects missing and oversized idempotency keys', async () => {
    const missing = await request('/api/v1/orders/order-1/cancel', 'customer');
    expect(missing.status, await missing.clone().text()).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      code: 'INVALID_REQUEST',
      statusCode: 400,
    });

    const oversized = await request(
      '/api/v1/orders/order-1/cancel',
      'customer',
      'x'.repeat(129),
    );
    expect(oversized.status).toBe(400);
    expect(commandService.cancelAsCustomer).not.toHaveBeenCalled();
  });

  function request(path: string, token: string, key?: string): Promise<Response> {
    return fetch(baseUrl + path, {
      method: 'POST',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
      },
    });
  }
});