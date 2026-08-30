import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import type { EnvironmentVariables } from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true }).split(',');

  app.use(helmet());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(new RequestIdMiddleware().use);
  await app.listen(config.get('API_PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
