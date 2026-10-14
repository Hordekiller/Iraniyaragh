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
import { AuthPrincipalService } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { OperationalReportController } from './operational-report.controller';
import { OperationalReportService } from './operational-report.service';
const resolver = {
  resolveBearerToken: vi.fn(async (header?: string) => {
    const token = header?.replace('Bearer ', '');
    if (
      ![
        'reporter',
        'credit',
        'onlycredit',
        'customer',
        'nopermissions',
        'sources',
      ].includes(token ?? '')
    )
      throw new AuthSessionException('AUTH_SESSION_INVALID');
    return {
      userId: 'isolated-report-user',
      sessionId: 'test-session',
      tokenId: 'test-token',
      authenticationLevel: token === 'customer' ? 'CUSTOMER_OTP' : 'STAFF_MFA',
      permissions: new Set(
        token === 'sources'
          ? ['reports.read', 'customers.read', 'catalog.read']
          : token === 'credit'
            ? ['reports.read', 'credit.read']
            : token === 'onlycredit'
              ? ['credit.read']
              : token === 'nopermissions'
                ? []
                : ['reports.read'],
      ),
      authenticatedAt: new Date(),
      accessExpiresAt: new Date(Date.now() + 60000),
    };
  }),
};
const service = {
  options: vi.fn(async () => ({ items: [] })),
  summary: vi.fn(async () => ({ totals: {} })),
  orders: vi.fn(async () => ({ items: [] })),
  debtors: vi.fn(async () => ({ items: [] })),
};
@Module({
  imports: [ApiFoundationModule],
  controllers: [OperationalReportController],
  providers: [
    { provide: OperationalReportService, useValue: service },
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
describe('Operational report authoritative HTTP auth and query boundaries', () => {
  let app: INestApplication, origin: string;
  const range =
    'from=2026-01-01T00%3A00%3A00Z&toExclusive=2026-01-02T00%3A00%3A00Z';
  const root = '/api/v1/reports/admin/operations';
  const call = (path: string, token?: string) =>
    fetch(`${origin}${root}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  beforeAll(async () => {
    app = await NestFactory.create(Harness, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());
  it('requires source permissions in addition to reports.read for bounded selectors', async () => {
    for (const kind of ['customer', 'product']) {
      expect((await call(`/options?kind=${kind}`, 'reporter')).status).toBe(
        403,
      );
      const response = await call(`/options?kind=${kind}`, 'sources');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    for (const query of [
      'kind=unknown',
      'kind=customer&userId=other',
      'kind=product&search=' + 'x'.repeat(65),
    ])
      expect((await call(`/options?${query}`, 'sources')).status).toBe(400);
    expect(service.options).toHaveBeenCalledTimes(2);
  });
  it('denies anonymous, expired and revoked sessions on every route before any source read', async () => {
    for (const path of [
      `?${range}`,
      `/orders?${range}`,
      '/debtors?asOf=2026-01-01T00%3A00%3A00Z',
    ])
      for (const token of [undefined, 'expired', 'revoked'])
        expect((await call(path, token)).status).toBe(401);
    for (const read of Object.values(service))
      expect(read).not.toHaveBeenCalled();
  });
  it('requires STAFF_MFA even if a customer happens to carry reports.read', async () => {
    expect((await call(`?${range}`, 'customer')).status).toBe(403);
    expect((await call(`?${range}`, 'nopermissions')).status).toBe(403);
    expect(service.summary).not.toHaveBeenCalled();
  });
  it('enforces both reports.read and credit.read for debtor data', async () => {
    const path = '/debtors?asOf=2026-01-01T00%3A00%3A00Z';
    for (const token of ['reporter', 'onlycredit', 'customer'])
      expect((await call(path, token)).status).toBe(403);
    expect(service.debtors).not.toHaveBeenCalled();
    const response = await call(path, 'credit');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(service.debtors).toHaveBeenCalledOnce();
  });
  it('permits bounded staff report reads with no-store and no owner derivation from query', async () => {
    for (const path of [`?${range}`, `/orders?${range}&offset=0&limit=25`]) {
      const response = await call(path, 'reporter');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(service.summary).toHaveBeenCalledOnce();
    expect(service.orders).toHaveBeenCalledOnce();
  });
  it.each([
    'customerId=other&customerId=another',
    'userId=owner',
    'status=PAID%27%20OR%20true',
    'grain=minute',
    'from=invalid',
    'amount=1',
  ])('rejects extra/injected summary filters %s', async (extra) => {
    expect((await call(`?${range}&${extra}`, 'reporter')).status).toBe(400);
    expect(service.summary).not.toHaveBeenCalled();
  });
  it.each(['limit=101', 'offset=-1', 'grain=day', 'customerId=%3Csvg%3E'])(
    'rejects unbounded/inapplicable order filters %s',
    async (extra) => {
      expect((await call(`/orders?${range}&${extra}`, 'reporter')).status).toBe(
        400,
      );
      expect(service.orders).not.toHaveBeenCalled();
    },
  );
  it('rejects an as-of future and PII/owner injection before debtor reads', async () => {
    for (const query of [
      'asOf=2099-01-01T00%3A00%3A00Z',
      'asOf=2026-01-01T00%3A00%3A00Z&userId=other',
    ])
      expect((await call(`/debtors?${query}`, 'credit')).status).toBe(400);
    expect(service.debtors).not.toHaveBeenCalled();
  });
});
