import 'reflect-metadata';

import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { AdminPaymentRefundController } from './admin-payment-refund.controller';
import { AdminPaymentRefundService } from './admin-payment-refund.service';

const principal = (
  level: 'CUSTOMER_OTP' | 'STAFF_MFA',
  permissions: string[],
  ageMs = 30_000,
): AuthPrincipalContext => ({
  sessionId: 'session',
  tokenId: 'token',
  userId: 'user-1',
  authenticatedAt: new Date(Date.now() - ageMs),
  accessExpiresAt: new Date(Date.now() + 600_000),
  authenticationLevel: level,
  permissions: new Set(permissions),
});
const principals = {
  staff: principal('STAFF_MFA', ['payments.refund']),
  stale: principal('STAFF_MFA', ['payments.refund'], 10 * 60_000),
  reader: principal('STAFF_MFA', ['payments.read']),
  customer: principal('CUSTOMER_OTP', ['payments.refund']),
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
    if (token in principals) return principals[token];
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};
const audit = { record: vi.fn(async () => undefined) };
const service = {
  record: vi.fn(async () => ({ data: { refund: { refundId: 'refund-1', paymentId: 'payment-1' } } })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [AdminPaymentRefundController],
  providers: [
    { provide: AdminPaymentRefundService, useValue: service },
    { provide: AuthPrincipalService, useValue: principalService },
    {
      provide: APP_GUARD,
      useValue: new AuthGuard(
        principalService as unknown as AuthPrincipalService,
        audit as unknown as AuditLogService,
      ),
    },
  ],
})
class TestModule {}

const body = {
  amountMinorUnits: '40000',
  gatewayReferenceId: 'ZR-REF-1',
  reason: 'CANCELLED_SHIPMENT',
};

describe('Admin payment refund HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  const post = (token?: string, payload: unknown = body, key: string | null = 'key-1') =>
    fetch(`${baseUrl}/api/v1/payments/admin/payment-1/refund`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: JSON.stringify(payload),
    });

  it('requires a fresh staff MFA principal with payments.refund', async () => {
    expect((await post()).status).toBe(401);
    expect((await post('customer')).status).toBe(403);
    expect((await post('reader')).status).toBe(403);
    expect((await post('stale')).status).toBe(401);
    expect(service.record).not.toHaveBeenCalled();

    const response = await post('staff');
    expect(response.status).toBe(200);
    expect(service.record).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment-1',
        actorId: 'user-1',
        idempotencyKey: 'key-1',
        amountMinorUnits: '40000',
        gatewayReferenceId: 'ZR-REF-1',
      }),
    );
  });

  it('requires an Idempotency-Key header', async () => {
    expect((await post('staff', body, null)).status).toBe(400);
    expect((await post('staff', body, '   ')).status).toBe(400);
    expect(service.record).not.toHaveBeenCalled();
  });

  it('rejects amounts that are not positive integers', async () => {
    for (const amountMinorUnits of ['0', '-1', '1.5', '40000.00', 'abc', '0040000', '9'.repeat(20)]) {
      const response = await post('staff', { ...body, amountMinorUnits });
      expect(response.status, amountMinorUnits).toBe(400);
    }
    expect(service.record).not.toHaveBeenCalled();
  });

  it('rejects missing or padded evidence', async () => {
    const rejected = [
      { ...body, gatewayReferenceId: '' },
      { ...body, gatewayReferenceId: '  ' },
      { ...body, gatewayReferenceId: ' ZR-REF-1 ' },
      { ...body, gatewayReferenceId: 'ZR\u0007REF' },
      { ...body, reason: '' },
      { ...body, reason: 'reason ' },
      { ...body, gatewayReferenceId: 'R'.repeat(129) },
      { ...body, reason: 'r'.repeat(256) },
      { ...body, note: 'n'.repeat(501) },
    ];
    for (const payload of rejected) {
      const response = await post('staff', payload);
      expect(response.status, JSON.stringify(payload).slice(0, 80)).toBe(400);
    }
    expect(service.record).not.toHaveBeenCalled();
  });

  it('rejects a body that carries order, customer or authority fields', async () => {
    for (const extra of [
      { orderId: 'order-1' },
      { customerId: 'customer-1' },
      { status: 'REFUNDED' },
      { refundedAmount: '40000' },
      { authority: 'claimed' },
    ]) {
      const response = await post('staff', { ...body, ...extra });
      expect(response.status, JSON.stringify(extra)).toBe(400);
    }
    expect(service.record).not.toHaveBeenCalled();
  });

  it('does not let the client choose the recorded payment status', async () => {
    const response = await post('staff', { ...body, paymentStatus: 'REFUNDED' });
    expect(response.status).toBe(400);
    expect(service.record).not.toHaveBeenCalled();
  });
});
