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
import { OrderReadController } from './order-read.controller';
import { OrderReadService } from './order-read.service';
import { StaffOrderController } from './staff-order.controller';
import { StaffOrderService } from './staff-order.service';

const basePrincipal = {
  sessionId: 'session-staff-order-http',
  tokenId: 'token-staff-order-http',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};

const staffPrincipal: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: 'staff-user-order',
  authenticationLevel: 'STAFF_MFA',
  permissions: new Set(['orders.manage', 'orders.read']),
});

const staffReadOnly: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: 'staff-read-only',
  authenticationLevel: 'STAFF_MFA',
  permissions: new Set(['orders.read']),
});

const otpPrincipal: AuthPrincipalContext = Object.freeze({
  ...basePrincipal,
  userId: 'customer-otp',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: new Set<string>(),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    if (authorization === 'Bearer staff') return staffPrincipal;
    if (authorization === 'Bearer read-only') return staffReadOnly;
    if (authorization === 'Bearer otp') return otpPrincipal;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};

const staffOrderService = {
  options: vi.fn(async (query: { kind: string; search?: string }) => ({
    data: {
      items:
        query.kind === 'customer'
          ? [
              {
                id: 'customer-1',
                label: 'م*** ر***',
                detail: '+98912*****000',
              },
            ]
          : [{ id: 'variant-1', label: 'SKU-1 — Chair', detail: null }],
      count: 1,
    },
  })),
  create: vi.fn(async (input: { actorId: string; idempotencyKey: string }) => ({
    data: {
      order: { id: 'order-staff-1', status: 'PENDING_PAYMENT' },
      replayed: false,
      reservations: [],
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
    },
  })),
};

/**
 * The read controller owns `orders/admin/:id`, which is the route that shadows
 * `orders/admin/options` when controllers are registered in the wrong order.
 * Keeping it in this app mirrors the production module so the lookup tests fail
 * if that shadowing ever comes back.
 */
const orderReadService = {
  getAdminOrder: vi.fn(async () => {
    throw new Error('the options route must not be handled as an order id');
  }),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [StaffOrderController, OrderReadController],
  providers: [
    { provide: StaffOrderService, useValue: staffOrderService },
    { provide: OrderReadService, useValue: orderReadService },
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
class StaffOrderHttpTestModule {}

const validBody = {
  customerId: 'customer-1',
  lines: [{ variantId: 'variant-1', quantity: 2 }],
  address: {
    provinceCode: 'THR',
    city: 'Tehran',
    address: 'Valiasr St',
    postalCode: '1234567890',
    recipient: 'Buyer',
    mobile: '+989120000000',
  },
};

describe('StaffOrderController HTTP authorization', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(StaffOrderHttpTestModule, { logger: false });
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

  function post(path: string, token?: string, key = 'key-1', body = validBody) {
    return fetch(baseUrl + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: token } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('creates an order for a staff principal holding orders.manage', async () => {
    const response = await post('/api/v1/orders/admin', 'Bearer staff', 'staff-key');
    expect(response.status, await response.clone().text()).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { order: { id: 'order-staff-1', status: 'PENDING_PAYMENT' } },
    });
    expect(staffOrderService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: staffPrincipal.userId,
        idempotencyKey: 'staff-key',
      }),
    );
  });

  it('lets an order-taker search customers and SKUs with the same permission', async () => {
    for (const kind of ['customer', 'variant']) {
      const response = await fetch(
        `${baseUrl}/api/v1/orders/admin/options?kind=${kind}&search=abc`,
        { headers: { authorization: 'Bearer staff' } },
      );
      expect(response.status, `${kind}: ${await response.clone().text()}`).toBe(200);
    }
    expect(staffOrderService.options).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'customer', search: 'abc' }),
    );
  });

  it('denies the lookup to a caller that only holds orders.read', async () => {
    for (const token of ['Bearer read-only', 'Bearer otp']) {
      const response = await fetch(
        `${baseUrl}/api/v1/orders/admin/options?kind=customer`,
        { headers: { authorization: token } },
      );
      expect(response.status).toBe(403);
    }
    expect(staffOrderService.options).not.toHaveBeenCalled();
  });

  it('requires a session for the lookup', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/orders/admin/options?kind=customer`,
    );
    expect(response.status).toBe(401);
    expect(staffOrderService.options).not.toHaveBeenCalled();
  });

  it('rejects a lookup without a kind', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/orders/admin/options`,
      { headers: { authorization: 'Bearer staff' } },
    );
    expect(response.status).toBe(400);
    expect(staffOrderService.options).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const response = await post('/api/v1/orders/admin');
    expect(response.status).toBe(401);
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('denies a staff token that only holds orders.read', async () => {
    const response = await post('/api/v1/orders/admin', 'Bearer read-only');
    expect(response.status).toBe(403);
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('denies a customer OTP token', async () => {
    const response = await post('/api/v1/orders/admin', 'Bearer otp');
    expect(response.status).toBe(403);
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('rejects a missing Idempotency-Key before touching the service', async () => {
    const response = await post('/api/v1/orders/admin', 'Bearer staff', '');
    expect(response.status).toBe(400);
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('rejects an empty line list', async () => {
    const response = await post(
      '/api/v1/orders/admin',
      'Bearer staff',
      'key-2',
      { ...validBody, lines: [] },
    );
    expect(response.status).toBe(400);
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('rejects a non-integer quantity', async () => {
    const response = await post(
      '/api/v1/orders/admin',
      'Bearer staff',
      'key-3',
      { ...validBody, lines: [{ variantId: 'variant-1', quantity: 0 }] },
    );
    expect(response.status).toBe(400);
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('refuses a client-supplied money field outright', async () => {
    for (const attempt of [
      { discount: { amount: '1', currency: 'IRR' } },
      { total: '1000' },
      { lines: [{ variantId: 'variant-1', quantity: 1, unitPrice: '1' }] },
    ]) {
      const response = await post(
        '/api/v1/orders/admin',
        'Bearer staff',
        'key-4',
        { ...validBody, ...attempt },
      );
      expect(response.status).toBe(400);
    }
    expect(staffOrderService.create).not.toHaveBeenCalled();
  });

  it('forwards a guest submission to the service so it can answer 422', async () => {
    const response = await post(
      '/api/v1/orders/admin',
      'Bearer staff',
      'key-5',
      { lines: validBody.lines, address: validBody.address },
    );
    expect(response.status).toBe(201);
    const forwarded = staffOrderService.create.mock.calls[0]?.[0] as {
      payload: Record<string, unknown>;
    };
    expect(forwarded.payload.customerId).toBeUndefined();
  });
});
