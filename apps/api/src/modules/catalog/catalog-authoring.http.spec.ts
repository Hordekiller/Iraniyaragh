import 'reflect-metadata';
import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductVariantAttributesUpdateDto } from './catalog.dto';
import { CatalogImportService } from './catalog-import.service';

// Guard/validation boundary unit test. Real mutations and browser flows are
// separately exercised against PostgreSQL and the complete running stack.
const domain = { updateVariantAttributes: vi.fn(async () => ({ data: { variant: { id: 'variant-1' } } })) };
const resolver = { resolveBearerToken: vi.fn(async (header: string | undefined) => {
  if (!header || header === 'Bearer expired' || header === 'Bearer revoked') throw new AuthSessionException('AUTH_SESSION_INVALID');
  return { userId: 'actor-1', authenticationLevel: header === 'Bearer customer' ? 'CUSTOMER_OTP' : 'STAFF_MFA', permissions: new Set(header === 'Bearer read-only' ? ['catalog.read'] : ['catalog.write']) };
}) };
// esbuild erases TypeScript design metadata. Supply the same dependency/body
// types emitted by the production tsc compiler; authorization metadata is untouched.
Reflect.defineMetadata('design:paramtypes', [CatalogService, CatalogImportService], CatalogController);
Reflect.defineMetadata('design:paramtypes', [Object, String, String, ProductVariantAttributesUpdateDto], CatalogController.prototype, 'updateVariantAttributes');

@Module({ imports: [ApiFoundationModule], controllers: [CatalogController], providers: [
  { provide: CatalogService, useValue: domain }, { provide: CatalogImportService, useValue: {} },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn() } as unknown as AuditLogService) },
] })
class AuthoringHttpModule {}

describe('Variant attribute mutation guard and validation', () => {
  let app: INestApplication;
  let origin: string;
  const input = { expectedVersion: 2, values: [{ attributeCode: 'color', optionCode: 'red' }] };
  beforeAll(async () => {
    app = await NestFactory.create(AuthoringHttpModule, { logger: false });
    app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => { await app.close(); });
  const request = (token?: string, body: unknown = input) => fetch(`${origin}/api/v1/catalog/admin/variants/variant-1/attributes`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'http-attribute-command', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  it('denies anonymous, expired and revoked sessions before invoking the domain', async () => {
    for (const token of [undefined, 'expired', 'revoked']) expect((await request(token)).status).toBe(401);
    expect(domain.updateVariantAttributes).not.toHaveBeenCalled();
  });
  it('requires staff MFA and the current catalog.write permission', async () => {
    for (const token of ['customer', 'read-only']) expect((await request(token)).status).toBe(403);
    expect(domain.updateVariantAttributes).not.toHaveBeenCalled();
  });
  it('uses the resolved principal, path, exact body and idempotency key', async () => {
    expect((await request('staff')).status).toBe(200);
    expect(domain.updateVariantAttributes).toHaveBeenCalledWith('actor-1', 'http-attribute-command', 'variant-1', input);
  });
  it.each([
    { ...input, actorId: 'another-user' }, { ...input, expectedVersion: -1 }, { ...input, values: [{ attributeCode: 'color', optionId: 'foreign-id' }] },
    { ...input, values: [{ attributeCode: 'color', optionCode: 'red', isVariantAxis: true }] }, { ...input, values: Array.from({ length: 101 }, () => input.values[0]) },
  ])('rejects owner/definition injection and invalid bounds: %j', async body => {
    expect((await request('staff', body)).status).toBe(400);
    expect(domain.updateVariantAttributes).not.toHaveBeenCalled();
  });
});
