import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { createApiDocument } from './swagger';

const OPENAPI_ARTIFACT_PATH = join(__dirname, '../openapi.json');

describe('OpenAPI document drift and contract', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    document = createApiDocument(app);
    await app.close();
  });

  it('is a valid OpenAPI 3.0 document', () => {
    expect(document.openapi).toBe('3.0.0');
    expect(document.info?.title).toBe('Iraniyaragh Commerce API');
    expect(document.info?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(document.paths).toBeDefined();
  });

  it('exposes the expected documentation surface', () => {
    const paths = Object.keys(document.paths ?? {});
    for (const expected of ['/health', '/health/live', '/health/ready']) {
      expect(paths).toContain(expected);
    }
    for (const expected of ['health', 'auth', 'catalog', 'inventory', 'orders']) {
      expect(document.tags?.map(tag => tag.name)).toContain(expected);
    }
  });

  it('matches the committed openapi.json artifact (CI drift check)', () => {
    const committed = JSON.parse(readFileSync(OPENAPI_ARTIFACT_PATH, 'utf8')) as OpenAPIObject;
    expect(document).toEqual(committed);
  });
});
