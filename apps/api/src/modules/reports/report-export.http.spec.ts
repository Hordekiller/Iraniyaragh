import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import {
  afterAll,
  beforeAll,
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
import { ReportExportController } from './report-export.controller';
import { ReportExportJobService } from './report-export-job.service';
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
  staff: principal('operator', 'STAFF_MFA', ['reports.read', 'reports.export']),
  reader: principal('operator', 'STAFF_MFA', ['reports.read']),
  stale: principal(
    'operator',
    'STAFF_MFA',
    ['reports.read', 'reports.export'],
    false,
  ),
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
const jobs = {
  request: vi.fn(async () => ({
    exportId: 'job-a',
    status: 'PENDING',
    sha256: null,
    byteCount: null,
    replayed: false,
  })),
  status: vi.fn(async () => ({
    exportId: 'job-a',
    status: 'READY',
    sha256: 'ab'.repeat(32),
    byteCount: 64,
    replayed: false,
  })),
  downloadStaff: vi.fn(async () => ({
    bytes: Buffer.from('section,period,label,environment,count,amount\r\n'),
    contentSha256: 'ab'.repeat(32),
    byteCount: 45,
    contentType: 'text/csv; charset=utf-8',
    filename: 'iranyaragh-operations-summary-20260101.csv',
  })),
};
@Module({
  imports: [ApiFoundationModule],
  controllers: [ReportExportController],
  providers: [
    { provide: ReportExportJobService, useValue: jobs },
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
const definition = {
  kind: 'operations-summary',
  filters: {
    from: '2026-01-01T00:00:00.000Z',
    toExclusive: '2026-01-31T00:00:00.000Z',
    grain: 'day',
  },
  maxRows: 20000,
};
describe('Report export HTTP authorization and bounded snapshot contract', () => {
  let app: INestApplication;
  let origin: string;
  beforeAll(async () => {
    app = await NestFactory.create(Harness, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  it('replies to an approved staff export request', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer staff',
        'content-type': 'application/json',
        'idempotency-key': 'export-request-key',
      },
      body: JSON.stringify({ definition, format: 'csv' }),
    });
    expect(response.status).toBe(200);
    expect(jobs.request.mock.lastCall?.[0].actorId).toBe('operator');
    expect(jobs.request.mock.lastCall?.[0].outputFormat).toBe('csv');
    expect(jobs.request.mock.lastCall?.[0].key).toBe('export-request-key');
  });
  it('keeps the export request to the approved permission', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer reader',
        'content-type': 'application/json',
        'idempotency-key': 'export-request-key',
      },
      body: JSON.stringify({ definition, format: 'csv' }),
    });
    expect(response.status).toBe(403);
    expect(jobs.request).not.toHaveBeenCalled();
  });
  it('rejects a stale authenticated request', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer stale',
        'content-type': 'application/json',
        'idempotency-key': 'export-request-key',
      },
      body: JSON.stringify({ definition, format: 'csv' }),
    });
    expect(response.status).toBe(401);
  });
  it('rejects unbounded fields on the request surface', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer staff',
        'content-type': 'application/json',
        'idempotency-key': 'export-request-key',
      },
      body: JSON.stringify({ definition, format: 'csv', unexpected: true }),
    });
    expect(response.status).toBe(400);
  });
  it('polls export status for a staff actor', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports/job-a`, {
      headers: { authorization: 'Bearer staff' },
    });
    expect(response.status).toBe(200);
    expect(jobs.status.mock.lastCall?.[0]).toBe('job-a');
  });
  it('keeps export downloads read-permission-gated', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports/job-a/artifact`, {
      headers: { authorization: 'Bearer staff' },
    });
    expect(response.status).toBe(200);
    expect(jobs.downloadStaff).toHaveBeenCalled();
  });
  it('rejects bad identity strings before service work', async () => {
    const response = await fetch(`${origin}/api/v1/reports/admin/exports/not-a-valid-identity/string`, {
      headers: { authorization: 'Bearer staff' },
    });
    expect(response.status).toBe(404);
  });
});
