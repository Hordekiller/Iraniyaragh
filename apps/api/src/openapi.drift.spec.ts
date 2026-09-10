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

  it('documents stable failure responses for every notifications admin operation', () => {
    const paths = document.paths ?? {};

    const smsPath: Record<string, string[]> = {
      '/notifications/admin/sms-settings': ['get', 'put'],
      '/notifications/admin/sms-settings/secret': ['post', 'delete'],
      '/notifications/admin/sms-settings/validate': ['post'],
      '/notifications/admin/sms-settings/test-send': ['post'],
      '/notifications/admin/sms-settings/diagnostics': ['get'],
    };

    const nonSuccessful = (operation: { responses?: Record<string, unknown> }) =>
      Object.keys(operation.responses ?? {}).filter(status => !/^2\d\d$/.test(status));

    for (const [path, operations] of Object.entries(smsPath)) {
      const pathItem = paths[path];
      expect(pathItem, `missing ${path}`).toBeDefined();
      for (const method of operations) {
        const operation = (pathItem as Record<string, { responses?: Record<string, unknown> }>)[method];
        expect(operation, `missing ${method.toUpperCase()} ${path}`).toBeDefined();

        const failures = nonSuccessful(operation);
        // No operation may regress to success-only documentation.
        expect(failures.length).toBeGreaterThan(0);

        if (path === '/notifications/admin/sms-settings' && method === 'get') {
          expect(failures).toEqual(expect.arrayContaining(['401', '403']));
        }
        if (path === '/notifications/admin/sms-settings/diagnostics') {
          expect(failures).toEqual(expect.arrayContaining(['401', '403']));
        }
        if (method === 'put') {
          expect(failures).toEqual(expect.arrayContaining(['400', '401', '403', '409', '503']));
        }
        if (path === '/notifications/admin/sms-settings/secret') {
          expect(failures).toEqual(expect.arrayContaining(['400', '401', '403', '422', '503']));
        }
        if (path === '/notifications/admin/sms-settings/test-send') {
          expect(failures).toEqual(expect.arrayContaining(['400', '401', '403', '422', '503']));
        }
        if (path === '/notifications/admin/sms-settings/validate') {
          expect(failures).toEqual(expect.arrayContaining(['401', '403', '503']));
        }
      }
    }
  });
});
