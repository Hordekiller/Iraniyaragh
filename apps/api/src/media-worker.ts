import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/environment';
import { ProductMediaImageProcessor } from './modules/media/image-processor.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const processor = app.get(ProductMediaImageProcessor);
  const worker = new Worker<{ mediaId: string }>(
    'product-media-processing',
    async job => processor.process(job.data.mediaId, {
      finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
    }),
    {
      connection: { url: config.get('REDIS_URL', { infer: true }) },
      prefix: 'iranyaragh',
      concurrency: config.get('PRODUCT_MEDIA_WORKER_CONCURRENCY', { infer: true }),
    },
  );
  worker.on('error', () => process.stderr.write('Product media worker infrastructure error.\n'));

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await worker.close();
    await app.close();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

void bootstrap();
