import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const OPENAPI_UI_PATH = 'api/docs';

export function createApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Iraniyaragh Commerce API')
    .setDescription(
      'REST API for the Iraniyaragh commerce platform. All responses use a stable error envelope ' +
        'with machine-readable codes and per-request IDs for correlation.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('health', 'Liveness and readiness probes')
    .addTag('auth', 'Authentication and token lifecycle')
    .addTag('catalog', 'Products, categories and variants')
    .addTag('inventory', 'Stocks and ledgers')
    .addTag('orders', 'Order lifecycle state machine')
    .addTag('payments', 'Payment lifecycle state machine')
    .addTag('customers', 'Customer records')
    .addTag('suppliers', 'Supplier records')
    .addTag('audit', 'Audit trail')
    .build();

  return SwaggerModule.createDocument(app, config);
}
