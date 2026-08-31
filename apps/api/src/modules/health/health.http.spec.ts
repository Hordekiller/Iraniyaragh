import { type INestApplication, Module, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import type { ErrorEnvelope } from '../../common/error-response';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import type { LivenessReport, ReadinessReport } from './health.types';

const liveReport: LivenessReport = {
  status: 'ok',
  service: 'iranyaragh-api',
  timestamp: '2026-08-31T00:00:00.000Z',
};

const readyReport: ReadinessReport = {
  status: 'ready',
  service: 'iranyaragh-api',
  timestamp: '2026-08-31T00:00:00.000Z',
  checks: { database: { status: 'up' } },
};

const healthService = {
  getLiveness: vi.fn((): LivenessReport => liveReport),
  getReadiness: vi.fn(async (): Promise<ReadinessReport> => readyReport),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [HealthController],
  providers: [{ provide: HealthService, useValue: healthService }],
})
class HealthHttpTestModule {}

describe('health HTTP endpoints', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(HealthHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    healthService.getLiveness.mockClear();
    healthService.getReadiness.mockReset();
    healthService.getReadiness.mockResolvedValue(readyReport);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/api/v1/health/live', '/api/v1/health'])('serves liveness at %s without caching', async path => {
    const response = await fetch(`${baseUrl}${path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(liveReport);
  });

  it('serves database readiness with a 200 response when ready', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/ready`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(readyReport);
  });

  it('serves a safe 503 envelope when the database is unavailable', async () => {
    const unavailableReport: ReadinessReport = {
      status: 'not_ready',
      service: 'iranyaragh-api',
      timestamp: '2026-08-31T00:00:00.000Z',
      checks: { database: { status: 'down' } },
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Required dependency is unavailable',
      },
    };
    healthService.getReadiness.mockResolvedValue(unavailableReport);

    const response = await fetch(`${baseUrl}/api/v1/health/ready`);
    const body = (await response.json()) as ErrorEnvelope & { details: ReadinessReport };

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(body).toMatchObject({
      code: 'HEALTH_NOT_READY',
      message: 'Required dependency is unavailable',
      statusCode: 503,
      details: unavailableReport,
    });
    expect(body.requestId).toBeTruthy();
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  });
});
