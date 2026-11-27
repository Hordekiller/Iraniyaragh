import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { CatalogService } from './catalog.service';
import { ShopService, DEFAULT_SHOP_CONTENT } from './shop.service';
import { WishlistService } from './wishlist.service';
import { ProductMediaCleanupService } from '../media/media-cleanup.service';
import type { ProductMediaStorage } from '../media/storage.port';

describe.sequential('Dedicated shop PostgreSQL invariants', () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const idempotency = new CatalogIdempotencyService(prisma);
  const catalog = new CatalogService(prisma, audit, idempotency);
  const shop = new ShopService(prisma, idempotency, audit, new ConfigService());
  const wishlist = new WishlistService(prisma, idempotency);
  const run = randomUUID();
  let actor = '', other = '', category = '', child = '', media = '', orphan = '';
  let products: Array<{ id: string; slug: string; variant: string }> = [];
  let connected = false;
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true;
    actor = (await prisma.user.create({ data: { email: `${run}@example.test` } })).id;
    other = (await prisma.user.create({ data: { email: `other-${run}@example.test` } })).id;
    category = (await prisma.category.create({ data: { name: 'Shop test', slug: `shop-${run}` } })).id;
    child = (await prisma.category.create({ data: { name: 'Child', slug: `child-${run}`, parentId: category } })).id;
    products = await Promise.all(Array.from({ length: 45 }, async (_, index) => {
      const row = await prisma.product.create({ data: { name: `Test ${index}`, slug: `shop-${run}-${index}`, status: 'ACTIVE', categoryId: child, variants: { create: { sku: `shop-${run}-${index}`, skuKey: `shop-${run}-${index}`, combinationSignature: 'default', salePrice: BigInt((index + 1) * 100), isActive: true, status: 'ACTIVE' } } }, include: { variants: true } });
      return { id: row.id, slug: row.slug, variant: row.variants[0]!.id };
    }));
    media = (await prisma.productMedia.create({ data: { assetScope: 'STOREFRONT', productId: null, kind: 'IMAGE', role: 'GALLERY', position: 0, state: 'READY', detectedMime: 'image/webp', bytes: 100n, width: 400, height: 300, checksumSha256: 'a'.repeat(64), objectKey: `test/${run}`, originalFilename: 'test.webp', declaredMime: 'image/webp', declaredBytes: 100n, altText: 'Test image', createdById: actor, uploadExpiresAt: new Date(), renditions: { create: { purpose: 'CARD', checksumSha256: 'a'.repeat(64), format: 'webp', width: 400, height: 300, bytes: 100n, objectKey: `test/${run}/card.webp` } } } })).id;
  });
  afterAll(async () => {
    if (!connected) return;
    await prisma.shopConfig.deleteMany({ where: { id: 'shop' } });
    if (orphan) await prisma.auditLog.deleteMany({ where: { entityType: 'ProductMedia', entityId: orphan } });
    await prisma.category.updateMany({ where: { id: { in: [category, child] } }, data: { imageAssetId: null } });
    await prisma.productMedia.deleteMany({ where: { id: { in: [media, orphan].filter(Boolean) } } });
    await prisma.product.deleteMany({ where: { id: { in: products.map(p => p.id) } } });
    await prisma.category.deleteMany({ where: { id: child } });
    await prisma.category.deleteMany({ where: { id: category } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [actor, other] } } });
    await prisma.user.deleteMany({ where: { id: { in: [actor, other] } } });
    await prisma.$disconnect();
  });
  it('sorts and filters all descendants before paginating with correct totals', async () => {
    const result = await catalog.listPublicProducts({ categoryId: category, sortBy: 'price', sortDir: 'desc', minPrice: '200', maxPrice: '4000', page: 2, perPage: 3 });
    expect(result.data.meta).toEqual({ page: 2, perPage: 3, total: 39, pages: 13 });
    expect(result.data.items.map(p => p.startingPrice?.amount)).toEqual(['3700', '3600', '3500']);
    expect((await catalog.listPublicProducts({ categoryId: category, available: 'true' })).data.meta.total).toBe(0);
  });
  it('requires verified prior price history for an offer', async () => {
    const product = products[0]!;
    expect((await catalog.listPublicProducts({ ids: product.id, discounted: 'true' })).data.items).toHaveLength(0);
    await prisma.variantPriceRecord.createMany({ data: [{ variantId: product.variant, salePrice: 200n, effectiveAt: new Date(Date.now() - 10000), actorUserId: actor, source: 'ADMIN' }, { variantId: product.variant, salePrice: 100n, effectiveAt: new Date(Date.now() - 1000), actorUserId: actor, source: 'ADMIN' }] });
    const result = await catalog.listPublicProducts({ ids: product.id, discounted: 'true' });
    expect(result.data.items[0]?.previousPrice?.amount).toBe('200');
    await prisma.productVariant.update({ where: { id: product.variant }, data: { salePrice: 150n } });
    expect((await catalog.listPublicProducts({ ids: product.id, discounted: 'true' })).data.items).toHaveLength(0);
  });
  it('resolves bounded slug batches and rejects malformed filters', async () => {
    expect((await catalog.listPublicProducts({ slugs: products.slice(0, 4).map(p => p.slug).join(',') })).data.meta.total).toBe(4);
    await expect(catalog.listPublicProducts({ ids: "x'); DROP TABLE Product;--" })).rejects.toThrow();
    await expect(catalog.listPublicProducts({ minPrice: '200', maxPrice: '100' })).rejects.toThrow();
  });
  it('isolates wishlist accounts, merges duplicates and replays safely', async () => {
    const input = { slugs: products.slice(0, 3).map(p => p.slug) };
    const key = `merge-${run}`;
    const first = await wishlist.change(actor, key, input);
    expect(await wishlist.change(actor, key, input)).toEqual(first);
    expect(await wishlist.list(other)).toEqual([]);
    expect(await wishlist.change(actor, `merge-again-${run}`, input)).toHaveLength(3);
    await wishlist.change(actor, `remove-${run}`, { slug: products[0]!.slug, enabled: false });
    expect(await wishlist.list(actor)).toHaveLength(2);
    await expect(wishlist.change(actor, key, { slugs: [] })).rejects.toThrow();
  });
  it('keeps the wishlist bounded under concurrent requests', async () => {
    await wishlist.change(other, `fill-${run}`, { slugs: products.slice(0, 39).map(p => p.slug) });
    const outcomes = await Promise.allSettled(products.slice(39, 42).map((p, i) => wishlist.change(other, `race-${run}-${i}`, { slug: p.slug, enabled: true })));
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await wishlist.list(other)).toHaveLength(40);
  });
  it('publishes separate versioned configuration, retains references and leaves homepage unchanged', async () => {
    const homepage = await prisma.homepageHeroConfig.findMany();
    const current = await shop.readAdmin();
    const input = { ...DEFAULT_SHOP_CONTENT, expectedVersion: current.version, categoryIds: [category], hero: [{ id: 'test', title: 'Test', subtitle: null, ctaLabel: 'Shop', href: '/catalog', desktopMediaId: media, mobileMediaId: null, imageAlt: 'Test', enabled: true, publishAt: null, unpublishAt: null }] };
    const result = await shop.update(actor, `config-${run}`, input);
    expect(await shop.update(actor, `config-${run}`, input)).toEqual(result);
    expect((await shop.readPublic()).hero[0]?.desktopImage.url).toContain('card.webp');
    expect(await prisma.shopAssetReference.count({ where: { mediaId: media } })).toBe(1);
    await expect(shop.update(actor, `stale-${run}`, input)).rejects.toThrow();
    expect(await prisma.homepageHeroConfig.findMany()).toEqual(homepage);
    await expect(prisma.productMedia.delete({ where: { id: media } })).rejects.toThrow();
  });
  it('supports category images without changing category identity or root relationships', async () => {
    await catalog.updateCategory(actor, child, { imageAssetId: media, imageAlt: 'Child image', shopOrder: 2, shopFeatured: true });
    const result = (await catalog.listCategories()).data.items.find(c => c.id === child);
    expect(result).toMatchObject({ parentId: category, imageAlt: 'Child image', shopFeatured: true, image: { width: 400 } });
    await expect(catalog.updateCategory(actor, child, { imageAssetId: 'missing' })).rejects.toThrow();
  });
  it('archives old unreferenced storefront images while retaining selected images', async () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await prisma.productMedia.update({ where: { id: media }, data: { createdAt: old } });
    orphan = (await prisma.productMedia.create({ data: {
      assetScope: 'STOREFRONT', productId: null, kind: 'IMAGE', role: 'GALLERY', position: 0,
      state: 'READY', detectedMime: 'image/webp', bytes: 100n, width: 400, height: 300,
      checksumSha256: 'b'.repeat(64), objectKey: `test/${run}/orphan`, originalFilename: 'orphan.webp',
      declaredMime: 'image/webp', declaredBytes: 100n, altText: 'Orphan image',
      createdById: actor, uploadExpiresAt: new Date(), createdAt: old,
    } })).id;
    const storage = { deleteObject: async () => {} } as unknown as ProductMediaStorage;
    await new ProductMediaCleanupService(prisma, storage).sweep();
    expect((await prisma.productMedia.findUniqueOrThrow({ where: { id: orphan } })).state).toBe('ARCHIVED');
    expect((await prisma.productMedia.findUniqueOrThrow({ where: { id: media } })).state).toBe('READY');
  });
});
