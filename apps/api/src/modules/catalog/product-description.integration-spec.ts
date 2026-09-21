import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogService } from './catalog.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';

describe.sequential('ProductDescription database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const prisma = new PrismaService();
  const auditLog = new AuditLogService(prisma);
  const idempotency = new CatalogIdempotencyService(prisma);
  const catalog = new CatalogService(prisma, auditLog, idempotency);
  let connected = false;
  let actorId = '';
  let productId = '';
  const productSlug = `description-product-${runId}`;
  const key = (name: string) => `catalog-description-${name}-${runId}`;

  async function createReadyImage(targetId: string, altText: string): Promise<{ id: string; widestRenditionObjectKey: string }> {
    const objectPrefix = `products/${targetId}/${randomUUID()}`;
    const media = await prisma.productMedia.create({
      data: {
        productId: targetId, kind: 'IMAGE', state: 'READY', role: 'GALLERY', position: 0,
        objectKey: `${objectPrefix}/source.webp`, originalFilename: 'source.webp',
        declaredMime: 'image/webp', declaredBytes: 100n, detectedMime: 'image/webp', bytes: 100n,
        width: 1200, height: 900, altText, caption: 'کپشن',
        checksumSha256: 'ab'.repeat(32), createdById: actorId,
        uploadExpiresAt: new Date(Date.now() + 60_000),
        renditions: {
          create: [
            { purpose: 'DETAIL_MD', format: 'webp', objectKey: `${objectPrefix}/r-600.webp`, bytes: 100n, width: 600, height: 450, checksumSha256: 'ab'.repeat(32) },
            { purpose: 'DETAIL_LG', format: 'webp', objectKey: `${objectPrefix}/r-1200.webp`, bytes: 200n, width: 1200, height: 900, checksumSha256: 'ab'.repeat(32) },
          ],
        },
      },
    });
    return { id: media.id, widestRenditionObjectKey: `${objectPrefix}/r-1200.webp` };
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    const actor = await prisma.user.create({
      data: {
        mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
        status: 'ACTIVE',
        isMobileVerified: true,
        createdAt: new Date(Date.now() - 60_000),
        mobileVerifiedAt: new Date(),
      },
    });
    actorId = actor.id;

    const product = await prisma.product.create({
      data: { name: 'Description Product', slug: productSlug },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({
      where: { entityId: productId, action: { startsWith: 'catalog.product.' } },
    });
    await prisma.productMedia.deleteMany({ where: { productId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('sanitizes rich text and rewrites description images from authoritative media', async () => {
    const media = await createReadyImage(productId, 'توضیح تصویر');
    const expectedUrl = `http://localhost:9000/products/${media.widestRenditionObjectKey}`;

    const saved = await catalog.updateProductDescription(actorId, key('rewrite'), productId, {
      description: `<p onclick="alert(1)">متن <img data-media-id="${media.id}" src="https://evil.example/x.png" width="10"> ضمیمه</p>`,
      expectedVersion: 1,
    });

    expect(saved.data.product.description).toContain(
      `<img data-media-id="${media.id}" src="${expectedUrl}" width="1200" height="900" alt="توضیح تصویر">`,
    );
    expect(saved.data.product.description).not.toContain('onclick');
    expect(saved.data.product.version).toBe(2);

    const dbRow = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(dbRow.description).toBe(saved.data.product.description);
  });

  it('rejects description images that are not ready images of the product', async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: productId, action: { startsWith: 'catalog.product.' } },
    });
    await prisma.productMedia.deleteMany({ where: { productId } });
    await prisma.product.update({ where: { id: productId }, data: { version: 1 } });

    await expect(
      catalog.updateProductDescription(actorId, key('invalid-media'), productId, {
        description: '<p><img data-media-id="unknownmedia1"></p>',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects stale versions with a conflict', async () => {
    await expect(
      catalog.updateProductDescription(actorId, key('stale'), productId, {
        description: '<p>جدید</p>',
        expectedVersion: 999,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears the description with null', async () => {
    const cleared = await catalog.updateProductDescription(actorId, key('clear'), productId, {
      description: null,
      expectedVersion: 1,
    });
    expect(cleared.data.product.description).toBeNull();
    const dbRow = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(dbRow.description).toBeNull();
  });

  it('rejects descriptions beyond the 100,000 character limit', async () => {
    await prisma.product.update({ where: { id: productId }, data: { version: 1 } });
    await expect(
      catalog.updateProductDescription(actorId, key('too-large'), productId, {
        description: 'x'.repeat(100_001),
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('is idempotent for the same key and audits only a safe summary', async () => {
    await prisma.auditLog.deleteMany({
      where: { action: 'catalog.product.description_updated', entityId: productId },
    });
    await prisma.product.update({ where: { id: productId }, data: { description: null, version: 1 } });
    const body = {
      description: '<p>نسخه امن</p>',
      expectedVersion: 1,
    };

    const first = await catalog.updateProductDescription(actorId, key('idem'), productId, body);
    const second = await catalog.updateProductDescription(actorId, key('idem'), productId, body);
    expect(second.data.product.description).toBe(first.data.product.description);

    const dbRow = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(dbRow.version).toBe(first.data.product.version);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'catalog.product.description_updated', entityId: productId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({
      length: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      mediaCount: 0,
      version: expect.any(Number),
    });
    expect(JSON.stringify(audits[0].after)).not.toContain('<p>');
  });

  it('drops image markup from create-product descriptions', async () => {
    const draft = await catalog.createProduct(actorId, key('create-drops-images'), {
      name: 'Create Drops Images',
      slug: `create-drops-images-${runId}`,
      description: '<p>بدون عکس <img data-media-id="f1c3m2"></p>',
    });
    expect(draft.data.product.description).toBe('<p>بدون عکس </p>');
  });

  it('throws NotFound for unknown products', async () => {
    await expect(
      catalog.updateProductDescription(actorId, key('missing'), 'no-such-product-id', {
        description: '<p>x</p>',
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});