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
    for (const expected of [
      'health',
      'auth',
      'catalog',
      'inventory',
      'cart',
      'orders',
      'reports',
    ]) {
      expect(document.tags?.map((tag) => tag.name)).toContain(expected);
    }
  });

  it('documents the bounded, permissioned, PII-free admin dashboard', () => {
    const operation = document.paths?.['/reports/admin/dashboard']?.get;
    expect(operation).toBeDefined();
    const parameterNames = (operation?.parameters ?? []).map((parameter) =>
      '$ref' in parameter ? parameter.$ref : parameter.name,
    );
    expect(parameterNames).toEqual(['createdToExclusive', 'createdFrom']);
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );

    const serialized = JSON.stringify(operation);
    for (const fact of [
      'grossOrderValue',
      'paymentAttemptsByStatus',
      'zeroAvailableBalances',
      'presentationTimezone',
    ]) {
      expect(serialized).toContain(fact);
    }
    for (const forbidden of [
      'mobile',
      'email',
      'address',
      'authority',
      'idempotencyKey',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('documents idempotent order cancellation commands with scoped failure surfaces', () => {
    const paths = document.paths ?? {};
    const customerCancel = paths['/orders/{id}/cancel']?.post;
    const staffCancel = paths['/orders/admin/{id}/cancel']?.post;

    expect(customerCancel).toBeDefined();
    expect(staffCancel).toBeDefined();

    for (const operation of [customerCancel, staffCancel]) {
      const idempotencyHeader = operation?.parameters?.find(
        (parameter) =>
          !('$ref' in parameter) && parameter.name === 'Idempotency-Key',
      );
      expect(idempotencyHeader).toMatchObject({
        in: 'header',
        required: true,
        description: expect.stringContaining('128'),
      });
      expect(Object.keys(operation?.responses ?? {})).toEqual(
        expect.arrayContaining(['200', '400', '401', '403', '404', '409']),
      );
      const serialized = JSON.stringify(operation);
      expect(serialized).toContain('releasedReservations');
      expect(serialized.toLowerCase()).not.toContain('idempotencykey:');
      expect(serialized.toLowerCase()).not.toContain('fingerprint');
    }

    expect(JSON.stringify(customerCancel?.summary)).toContain('owned');
    expect(JSON.stringify(staffCancel?.summary)).toContain('staff');
    const artifact = JSON.stringify(document);
    expect(artifact).not.toContain('orders.manage');
    expect(artifact).not.toContain('STAFF_MFA');
  });

  it('matches the committed openapi.json artifact (CI drift check)', () => {
    const committed = JSON.parse(
      readFileSync(OPENAPI_ARTIFACT_PATH, 'utf8'),
    ) as OpenAPIObject;
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

    const nonSuccessful = (operation: {
      responses?: Record<string, unknown>;
    }) =>
      Object.keys(operation.responses ?? {}).filter(
        (status) => !/^2\d\d$/.test(status),
      );

    for (const [path, operations] of Object.entries(smsPath)) {
      const pathItem = paths[path];
      expect(pathItem, `missing ${path}`).toBeDefined();
      for (const method of operations) {
        const operation = (
          pathItem as Record<string, { responses?: Record<string, unknown> }>
        )[method];
        expect(
          operation,
          `missing ${method.toUpperCase()} ${path}`,
        ).toBeDefined();

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
          expect(failures).toEqual(
            expect.arrayContaining(['400', '401', '403', '409', '503']),
          );
        }
        if (path === '/notifications/admin/sms-settings/secret') {
          expect(failures).toEqual(
            expect.arrayContaining(['400', '401', '403', '422', '503']),
          );
        }
        if (path === '/notifications/admin/sms-settings/test-send') {
          expect(failures).toEqual(
            expect.arrayContaining(['400', '401', '403', '422', '503']),
          );
        }
        if (path === '/notifications/admin/sms-settings/validate') {
          expect(failures).toEqual(
            expect.arrayContaining(['401', '403', '503']),
          );
        }
      }
    }
  });

  it('documents bounded customer and permissioned staff order reads', () => {
    const paths = document.paths ?? {};
    for (const path of [
      '/orders',
      '/orders/{id}',
      '/orders/admin',
      '/orders/admin/{id}',
    ]) {
      expect(paths[path], `missing ${path}`).toBeDefined();
      expect(paths[path]?.get, `missing GET ${path}`).toBeDefined();
    }

    const customerList = paths['/orders']?.get;
    const adminList = paths['/orders/admin']?.get;
    const customerDetail = paths['/orders/{id}']?.get;
    const adminDetail = paths['/orders/admin/{id}']?.get;
    const parameterNames = (operation: typeof customerList) =>
      (operation?.parameters ?? []).map((parameter) =>
        '$ref' in parameter ? parameter.$ref : parameter.name,
      );

    expect(parameterNames(customerList)).toEqual(
      expect.arrayContaining(['page', 'perPage', 'status', 'sortDir']),
    );
    expect(parameterNames(adminList)).toEqual(
      expect.arrayContaining([
        'page',
        'perPage',
        'status',
        'paymentStatus',
        'fulfillmentStatus',
        'createdFrom',
        'createdTo',
        'sortBy',
        'sortDir',
        'search',
      ]),
    );
    expect(Object.keys(customerDetail?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '401', '403', '404']),
    );
    expect(Object.keys(adminDetail?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '401', '403', '404']),
    );

    const serializedAdmin = JSON.stringify(adminDetail);
    expect(serializedAdmin).toContain('displayNameMasked');
    expect(serializedAdmin).toContain('addressMasked');
    for (const forbidden of [
      'authority',
      'idempotencyKey',
      'warehouseLocationId',
      'ipHash',
      'userAgent',
    ]) {
      expect(serializedAdmin).not.toContain(forbidden);
    }
  });

  it('documents the authenticated cart contract and mutation failures', () => {
    const paths = document.paths ?? {};
    const cartRead = paths['/cart']?.get;
    const add = paths['/cart/lines']?.post;
    const set = paths['/cart/lines/{variantId}']?.put;
    const remove = paths['/cart/lines/{variantId}']?.delete;

    expect(cartRead).toBeDefined();
    expect(add).toBeDefined();
    expect(set).toBeDefined();
    expect(remove).toBeDefined();
    expect(Object.keys(cartRead?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '401', '403', '409']),
    );

    for (const operation of [add, set, remove]) {
      const idempotencyHeader = operation?.parameters?.find(
        (parameter) =>
          !('$ref' in parameter) && parameter.name === 'Idempotency-Key',
      );
      expect(idempotencyHeader).toMatchObject({
        in: 'header',
        required: true,
      });
      expect(Object.keys(operation?.responses ?? {})).toEqual(
        expect.arrayContaining(['400', '401', '403', '409']),
      );
    }

    expect(Object.keys(add?.responses ?? {})).toContain('404');
    expect(Object.keys(add?.responses ?? {})).toContain('422');
    expect(Object.keys(set?.responses ?? {})).toContain('404');
    expect(Object.keys(set?.responses ?? {})).toContain('422');

    const readContract = JSON.stringify(cartRead?.responses?.['200']);
    expect(readContract).toContain('"nullable":true');
    expect(readContract).toContain('"minimum":0');
    expect(readContract).toContain('pricePolicyRevision');
  });

  it('documents bounded inventory reads and optimistic transfer commands without replay-key leakage', () => {
    const paths = document.paths ?? {};
    const transferList = paths['/inventory/transfers']?.get;
    const transferCreate = paths['/inventory/transfers']?.post;
    const transferDetail = paths['/inventory/transfers/{id}']?.get;
    const dispatch = paths['/inventory/transfers/{id}/dispatch']?.post;

    expect(transferList).toBeDefined();
    expect(transferCreate).toBeDefined();
    expect(transferDetail).toBeDefined();
    expect(dispatch).toBeDefined();

    const listParameters = (transferList?.parameters ?? []).map((parameter) =>
      '$ref' in parameter ? parameter.$ref : parameter.name,
    );
    expect(listParameters).toEqual(
      expect.arrayContaining([
        'status',
        'sourceWarehouseId',
        'targetWarehouseId',
        'offset',
        'limit',
      ]),
    );

    for (const operation of [transferCreate, dispatch]) {
      const idempotencyHeader = operation?.parameters?.find(
        (parameter) =>
          !('$ref' in parameter) && parameter.name === 'Idempotency-Key',
      );
      expect(idempotencyHeader).toMatchObject({ in: 'header' });
    }

    const createRequest = JSON.stringify(transferCreate?.requestBody);
    expect(createRequest).toContain('sourceWarehouseId');
    expect(createRequest).toContain('targetWarehouseId');
    expect(createRequest).toContain('minItems');
    expect(createRequest).toContain('maxItems');

    const actionRequest = JSON.stringify(dispatch?.requestBody);
    expect(actionRequest).toContain('expectedVersion');

    const responseContract = JSON.stringify(transferDetail?.responses?.['200']);
    expect(responseContract).toContain('"version"');
    expect(responseContract).not.toContain('idempotencyKey');
  });

  it('restricts the general inventory change contract to receipt and manual adjustment movements', () => {
    const change = document.paths?.['/inventory/changes']?.post;
    const request = JSON.stringify(change?.requestBody);

    expect(change).toBeDefined();
    expect(request).toContain('RECEIPT');
    expect(request).toContain('ADJUSTMENT_IN');
    expect(request).toContain('ADJUSTMENT_OUT');
    expect(request).not.toContain('TRANSFER_OUT');
    expect(request).not.toContain('SALE');
    expect(request).toContain('Positive for RECEIPT/ADJUSTMENT_IN; negative for ADJUSTMENT_OUT.');
  });
});
