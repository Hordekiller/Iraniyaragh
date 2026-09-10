import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { createApiDocument } from './swagger';

const OPENAPI_ARTIFACT_PATH = join(__dirname, '../openapi.json');

describe('OpenAPI artifact regeneration', () => {
  let document: ReturnType<typeof createApiDocument>;

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    document = createApiDocument(app);
    await app.close();
  });

  it('rewrites the committed artifact only when REGENERATE_OPENAPI=1', () => {
    if (process.env.REGENERATE_OPENAPI === '1') {
      writeFileSync(OPENAPI_ARTIFACT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    }
    expect(document.paths).toBeDefined();
  });
});