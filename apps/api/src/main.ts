import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedactedLogger } from './common/redacted-logger';
import type { EnvironmentVariables, TrustProxySetting } from './config/environment';
import { createApiDocument, OPENAPI_UI_PATH } from './swagger';

function trustProxyExpressValue(setting: TrustProxySetting): boolean | number | string[] {
  switch (setting.kind) {
    case 'disabled':
      return false;
    case 'hops':
      return setting.count;
    case 'subnets':
      return [...setting.subnets];
  }
}

async function bootstrap() {
  const logger = new RedactedLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, logger });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true }).split(',');

  app.useLogger(logger);
  app.set('trust proxy', trustProxyExpressValue(config.get('TRUST_PROXY', { infer: true })));
  app.use(helmet());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-ID',
      'X-Correlation-ID',
      'X-CSRF-Token',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Correlation-ID'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (process.env.ENABLE_SWAGGER !== 'false') {
    const document = createApiDocument(app);
    SwaggerModule.setup(OPENAPI_UI_PATH, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    await app.init();
  }

  await app.listen(config.get('API_PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
