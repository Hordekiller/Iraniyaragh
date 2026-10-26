import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import { BoundedWakeupQueue, wakeupRedisUrl } from '../redis/queue-wakeup';
import {
  REPORT_EXPORT_QUEUE_NAME,
  REPORT_EXPORT_QUEUE_PREFIX,
  type ReportExportQueue,
} from './report-export-queue.port';

@Injectable()
export class BullMqReportExportQueue
  extends BoundedWakeupQueue
  implements ReportExportQueue
{
  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    super(
      {
        name: REPORT_EXPORT_QUEUE_NAME,
        prefix: REPORT_EXPORT_QUEUE_PREFIX,
        label: 'report-export wake-up',
        jobName: 'export',
      },
      wakeupRedisUrl(config),
    );
  }
}
