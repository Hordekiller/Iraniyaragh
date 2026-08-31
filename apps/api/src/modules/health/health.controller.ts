import { Controller, Get, Header, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import type { LivenessReport, ReadinessReport } from './health.types';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getLegacyHealth(): LivenessReport {
    return this.healthService.getLiveness();
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLiveness(): LivenessReport {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async getReadiness(): Promise<ReadinessReport> {
    const report = await this.healthService.getReadiness();

    if (report.status === 'not_ready') {
      throw new ServiceUnavailableException({
        code: 'HEALTH_NOT_READY',
        message: report.error?.message ?? 'Required dependency is unavailable',
        details: report,
      });
    }

    return report;
  }
}
