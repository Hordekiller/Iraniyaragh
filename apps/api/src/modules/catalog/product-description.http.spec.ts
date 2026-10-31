import 'reflect-metadata';
import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { configureRequestBody, JSON_BODY_LIMIT_BYTES } from '../../common/request-body';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { CatalogController } from './catalog.controller';
import { CatalogImportService } from './catalog-import.service';
import { CatalogService } from './catalog.service';
import { ProductCreateDto, ProductDescriptionDto } from './catalog.dto';

const domain = {
  createProduct: vi.fn(async (_actor: string, _key: string, body: ProductCreateDto) => ({ data: { product: { id: 'test-product', ...body, version: 1 } } })),
  updateProductDescription: vi.fn(async (_actor: string, _key: string, id: string, body: ProductDescriptionDto) => ({ data: { product: { id, description: body.description, version: body.expectedVersion + 1 } } })),
};
const resolver = { resolveBearerToken: vi.fn(async (header?: string) => {
  if (!header) throw new AuthSessionException('AUTH_SESSION_INVALID');
  return { userId: 'test-actor', authenticationLevel: header === 'Bearer customer' ? 'CUSTOMER_OTP' : 'STAFF_MFA', permissions: new Set(header === 'Bearer reader' ? ['catalog.read'] : ['catalog.write']) };
}) };
// Match production tsc metadata; Vitest's transformer omits it.
Reflect.defineMetadata('design:paramtypes', [CatalogService, CatalogImportService], CatalogController);
Reflect.defineMetadata('design:paramtypes', [Object, String, ProductCreateDto], CatalogController.prototype, 'createProduct');
Reflect.defineMetadata('design:paramtypes', [Object, String, String, ProductDescriptionDto], CatalogController.prototype, 'description');
@Module({ imports: [ApiFoundationModule], controllers: [CatalogController], providers: [
  { provide: CatalogService, useValue: domain }, { provide: CatalogImportService, useValue: {} },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn() } as unknown as AuditLogService) },
] }) class DescriptionHttpModule {}

describe('Persian product description HTTP transport', () => {
  let app: NestExpressApplication, origin: string;
  const description = `<h2>راهنمای خرید یراق</h2><p>${'توضیحات دقیق محصول و راهنمای نصب '.repeat(2500)}</p>`;
  const request = (body: unknown, token: string | undefined = 'staff', create = false) => fetch(`${origin}/api/v1/catalog/admin/products${create ? '' : '/test-product/description'}`, {
    method: create ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'description-http-save-test', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(DescriptionHttpModule, { logger: false });
    configureRequestBody(app);
    app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks()); afterAll(async () => app.close());
  it('accepts valid Persian HTML above the default 100 KiB JSON limit without truncation', async () => {
    expect(description.length).toBeLessThan(100000);
    expect(Buffer.byteLength(JSON.stringify({ description, expectedVersion: 1 }))).toBeGreaterThan(100 * 1024);
    const response = await request({ description, expectedVersion: 1 });
    expect(response.status).toBe(200);
    expect((await response.json()).data.product.description).toBe(description);
    expect(domain.updateProductDescription).toHaveBeenCalledWith('test-actor', 'description-http-save-test', 'test-product', { description, expectedVersion: 1 });
  });
  it('accepts the same Persian description when creating a product', async () => {
    const body = { name: 'کالای آزمایشی', slug: 'synthetic-product', description };
    expect((await request(body, 'staff', true)).status).toBe(201);
    expect(domain.createProduct).toHaveBeenCalledWith('test-actor', 'description-http-save-test', body);
  });
  it('still rejects overlong descriptions and unsupported fields before any domain mutation', async () => {
    for (const body of [{ description: 'ی'.repeat(100001), expectedVersion: 1 }, { description, expectedVersion: 1, actorId: 'spoof' }]) {
      expect((await request(body)).status).toBe(400);
    }
    expect(domain.updateProductDescription).not.toHaveBeenCalled();
  });
  it('retains staff MFA and current write permission for large requests', async () => {
    const body = { description, expectedVersion: 1 };
    expect((await request(body, '')).status).toBe(401);
    for (const token of ['reader', 'customer']) expect((await request(body, token)).status).toBe(403);
    expect(domain.updateProductDescription).not.toHaveBeenCalled();
  });
  it('returns a bounded definitive 413 envelope for oversized JSON without exposing content', async () => {
    const response = await request({ description: 'x'.repeat(JSON_BODY_LIMIT_BYTES + 1), expectedVersion: 1 });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: 'PAYLOAD_TOO_LARGE', statusCode: 413, message: 'The JSON request exceeds the allowed size.', requestId: expect.any(String) });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(domain.updateProductDescription).not.toHaveBeenCalled();
  });
});
