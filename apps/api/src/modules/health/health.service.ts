import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { API_SERVICE_NAME, type LivenessReport, type ReadinessReport } from './health.types';

const DATABASE_READINESS_TIMEOUT_MS = 1_500;

async function rejectAfter<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Dependency readiness check timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getLiveness(): LivenessReport {
    return {
      status: 'ok',
      service: API_SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessReport> {
    try {
      await rejectAfter(this.prisma.$queryRaw`SELECT 1`, DATABASE_READINESS_TIMEOUT_MS);

      return {
        status: 'ready',
        service: API_SERVICE_NAME,
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'up' } },
      };
    } catch {
      return {
        status: 'not_ready',
        service: API_SERVICE_NAME,
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'down' } },
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Required dependency is unavailable',
        },
      };
    }
  }
}
