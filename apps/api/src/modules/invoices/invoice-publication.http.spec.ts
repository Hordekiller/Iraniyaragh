import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import {
  AuthPrincipalService,
  type AuthPrincipalContext,
} from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import {
  CustomerInvoiceController,
  InvoicePublicationController,
} from './invoice-publication.controller';
import { InvoicePublicationService } from './invoice-publication.service';
const principal = (
  userId: string,
  level: 'CUSTOMER_OTP' | 'STAFF_MFA',
  permissions: string[],
  fresh = true,
): AuthPrincipalContext => ({
  userId,
  sessionId: 'test-session',
  tokenId: 'test-token',
  authenticationLevel: level,
  permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (fresh ? 0 : 600000)),
  accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = {
  staff: principal('operator', 'STAFF_MFA', [
    'invoices.read',
    'invoices.publish',
  ]),
  reader: principal('operator', 'STAFF_MFA', ['invoices.read']),
  publisher: principal('operator', 'STAFF_MFA', ['invoices.publish']),
  stale: principal(
    'operator',
    'STAFF_MFA',
    ['invoices.read', 'invoices.publish'],
    false,
  ),
  customer: principal('customer-a', 'CUSTOMER_OTP', []),
};
const resolver = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const token = authorization?.replace(
      'Bearer ',
      '',
    ) as keyof typeof principals;
    if (token in principals) return principals[token];
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};
const service = {
  read: vi.fn(async () => ({
    publication: { version: 0, isPublished: false },
    history: [],
    count: 0,
    offset: 0,
    limit: 25,
  })),
  change: vi.fn(async () => ({
    publication: { version: 1, isPublished: true },
    replayed: false,
  })),
  customerRead: vi.fn(async () => ({ id: 'doc-a' })),
  customerList: vi.fn(async () => ({
    items: [],
    count: 0,
    offset: 0,
    limit: 25,
  })),
};
@Module({
  imports: [ApiFoundationModule],
  controllers: [InvoicePublicationController, CustomerInvoiceController],
  providers: [
    { provide: InvoicePublicationService, useValue: service },
    { provide: AuthPrincipalService, useValue: resolver },
    {
      provide: APP_GUARD,
      useValue: new AuthGuard(
        resolver as unknown as AuthPrincipalService,
        { record: vi.fn(async () => undefined) } as unknown as AuditLogService,
      ),
    },
  ],
})
class Harness {}
describe('Invoice visibility HTTP authorization and customer-self boundaries', () => {
  let app: INestApplication;
  let origin: string;
  const call = (
    path: string,
    token?: string,
    body?: unknown,
    key = 'visibility-test-key',
  ) =>
    fetch(`${origin}/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'PUT',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const admin = '/invoices/admin/documents/doc-a/publication';
  const body = {
    expectedVersion: 0,
    isPublished: true,
    reason: 'Approved customer access',
  };
  beforeAll(async () => {
    app = await NestFactory.create(Harness, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());
  it('denies anonymous, revoked and expired sessions before any protected read/write', async () => {
    for (const path of [
      admin,
      '/customers/me/invoices',
      '/customers/me/invoices/doc-a',
    ])
      for (const token of [undefined, 'revoked', 'expired'])
        expect((await call(path, token)).status).toBe(401);
    expect((await call(admin, 'revoked', body)).status).toBe(401);
    for (const method of Object.values(service))
      expect(method).not.toHaveBeenCalled();
  });
  it('requires current staff read/publish permissions and fresh MFA even for command replays', async () => {
    for (const token of ['reader', 'publisher', 'customer', 'stale'])
      expect((await call(admin, token, body)).status).toBe(
        token === 'stale' ? 401 : 403,
      );
    expect(service.change).not.toHaveBeenCalled();
    const response = await call(admin, 'staff', body);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(service.change).toHaveBeenCalledWith(
      'operator',
      expect.any(String),
      'doc-a',
      body,
      'visibility-test-key',
    );
  });
  it('customer reads use only the authenticated principal and never staff administrative paths', async () => {
    for (const path of [
      '/customers/me/invoices',
      '/customers/me/invoices/doc-a',
    ]) {
      const response = await call(path, 'customer');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(service.customerList).toHaveBeenCalledWith('customer-a', 0, 25);
    expect(service.customerRead).toHaveBeenCalledWith('customer-a', 'doc-a');
    expect((await call(admin, 'customer')).status).toBe(403);
    expect((await call('/customers/me/invoices', 'staff')).status).toBe(403);
  });
  it.each([
    { customerId: 'foreign' },
    { userId: 'foreign' },
    { actorId: 'spoof' },
    { number: 'fake' },
    { total: '1' },
    { state: 'PAID' },
    { isPublished: 'true' },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { reason: '' },
    { reason: undefined },
  ])('rejects identity/financial/state/body spoofing', async (patch) => {
    expect((await call(admin, 'staff', { ...body, ...patch })).status).toBe(
      400,
    );
    expect(service.change).not.toHaveBeenCalled();
  });
  it.each([
    '/customers/me/invoices?customerId=foreign',
    '/customers/me/invoices?userId=foreign',
    '/customers/me/invoices?offset=-1',
    '/customers/me/invoices?limit=101',
    '/customers/me/invoices/doc-a?customerId=foreign',
  ])('rejects ownership/pagination query tampering', async (path) => {
    expect((await call(path, 'customer')).status).toBe(400);
    expect(service.customerRead).not.toHaveBeenCalled();
    expect(service.customerList).not.toHaveBeenCalled();
  });
  it('requires a bounded idempotency key and allows safe staff-only paginated history', async () => {
    expect((await call(admin, 'staff', body, '')).status).toBe(400);
    expect(service.change).not.toHaveBeenCalled();
    expect((await call(`${admin}?offset=25&limit=25`, 'reader')).status).toBe(
      200,
    );
    expect(service.read).toHaveBeenCalledWith('doc-a', 25, 25);
  });
});
