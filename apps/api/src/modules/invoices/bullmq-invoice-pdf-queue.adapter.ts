import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import { BoundedWakeupQueue, wakeupRedisUrl } from '../redis/queue-wakeup';
import {
  INVOICE_PDF_QUEUE_NAME,
  INVOICE_PDF_QUEUE_PREFIX,
  type InvoicePdfQueue,
} from './invoice-pdf-queue.port';

@Injectable()
export class BullMqInvoicePdfQueue
  extends BoundedWakeupQueue
  implements InvoicePdfQueue
{
  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    super(
      {
        name: INVOICE_PDF_QUEUE_NAME,
        prefix: INVOICE_PDF_QUEUE_PREFIX,
        label: 'invoice-pdf wake-up',
        jobName: 'render',
      },
      wakeupRedisUrl(config),
    );
  }
}
