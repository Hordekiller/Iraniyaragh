import 'reflect-metadata';

import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory, type INestApplication } from '@nestjs/core';
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
import {
  AuthPrincipalService,
  type AuthPrincipalContext,
} from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

const principalBase = {
  sessionId: 'session-dashboard-http',
  tokenId: 'token-dashboard-http',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};

const customerPrincipal: AuthPrincipalContext = Object.freeze({
  ...principalBase,
  userId: 'customer-dashboard-http',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: new Set<string>(),
});

const staffPrincipal: AuthPrincipalContext = Object.freeze({
  ...principalBase,
  userId: 'staff-dashboard-http',
  authenticationLevel: 'STAFF_MFA',
  permissions: new Set(['reports.read']),
});

const staffWithoutPermission: AuthPrincipalContext = Object.freeze({
  ...staffPrincipal,
  userId: 'staff-without-reports-read',
  permissions: new Set(['orders.read']),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    if (authorization === 'Bearer customer') return customerPrincipal;
    if (authorization === 'Bearer staff') return staffPrincipal;
    if (authorization === 'Bearer staff-without-permission')
      return staffWithoutPermission;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};

const dashboardService = {
  getSummary: vi.fn(async () => ({
    data: {
      summary: {
        generatedAt: '2026-09-19T08:30:00.000Z',
        presentationTimezone: 'Asia/Tehran',
        range: {
          createdFrom: '2026-09-01T00:00:00.000Z',
          createdToExclusive: '2026-09-08T00:00:00.000Z',
        },
        rangeMetrics: {
          ordersCreated: 0,
          grossOrderValue: { amount: '0', currency: 'IRR' },
        },
        commerceSnapshot: {
          ordersByStatus: [],
          paymentAttemptsByStatus: [],
          fulfillmentsByStatus: [],
          ordersWithoutPaymentAttempts: 0,
          ordersWithoutFulfillment: 0,
        },
        inventorySnapshot: {
          zeroAvailableBalances: 0,
          activeReservations: 0,
          reservationsByStatus: [],
          transfersByStatus: [],
        },
      },
    },
  })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [DashboardController],
  providers: [
    { provide: DashboardService, useValue: dashboardService },
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
class DashboardHttpTestModule {}

describe('DashboardController HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(DashboardHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires staff MFA and reports.read', async () => {
    const path = validPath();

    const anonymous = await fetch(baseUrl + path);
    expect(anonymous.status).toBe(401);

    const customer = await request(path, 'customer');
    expect(customer.status).toBe(403);

    const unprivileged = await request(path, 'staff-without-permission');
    expect(unprivileged.status).toBe(403);

    expect(dashboardService.getSummary).not.toHaveBeenCalled();
  });

  it('returns the real service contract without permitting caches', async () => {
    const response = await request(validPath(), 'staff');

    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(dashboardService.getSummary).toHaveBeenCalledWith({
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdToExclusive: '2026-09-08T00:00:00.000Z',
    });
  });

  it.each([
    '?createdFrom=2026-09-01T00%3A00%3A00.000Z',
    '?createdFrom=2026-09-01&createdToExclusive=2026-09-08T00%3A00%3A00.000Z',
    '?createdFrom=2026-09-01T00%3A00%3A00.000Z&createdToExclusive=2026-09-08T00%3A00%3A00.000Z&internal=true',
  ])(
    'rejects missing, non-instant, or unknown query input: %s',
    async (query) => {
      const response = await request(
        `/api/v1/reports/admin/dashboard${query}`,
        'staff',
      );
      expect(response.status, await response.clone().text()).toBe(400);
      expect(dashboardService.getSummary).not.toHaveBeenCalled();
    },
  );

  function validPath(): string {
    return '/api/v1/reports/admin/dashboard?createdFrom=2026-09-01T00%3A00%3A00.000Z&createdToExclusive=2026-09-08T00%3A00%3A00.000Z';
  }

  function request(path: string, token: string): Promise<Response> {
    return fetch(baseUrl + path, {
      headers: { authorization: `Bearer ${token}` },
    });
  }
});
