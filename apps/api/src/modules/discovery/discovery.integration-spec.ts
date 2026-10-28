import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ConfigService } from '@nestjs/config';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { DiscoveryService } from './discovery.service';

describe.sequential('Real catalog sitemap PostgreSQL acceptance', () => {
  const prisma = new PrismaService();
  const config = new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' });
  const service = new DiscoveryService(prisma, config);
  const run = randomUUID().replaceAll('-', '').slice(0, 16);
  const products: string[] = [], categories: string[] = [];
  let brandId = '', rootSlug = '', leafSlug = '', liveSlug = '', draftSlug = '', archivedSlug = '';
  let liveId = '';
  const makeProduct = async (suffix: string, status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED', active = true) => {
    const row = await prisma.product.create({ data: { name: `SEO TEST ${run} ${suffix}`, slug: `seo-${run}-${suffix}`, status, categoryId: categories.at(-1), brandId,
      variants: { create: { sku: `SEO-${run}-${suffix}`, skuKey: `SEO-${run}-${suffix}`.toUpperCase(), combinationSignature: 'empty', salePrice: 10000n, status: active ? 'ACTIVE' : 'INACTIVE', isActive: active } } } });
    products.push(row.id); return row;
  };
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    const brand = await prisma.brand.create({ data: { name: `SEO TEST ${run}`, slug: `seo-${run}-brand` } }); brandId = brand.id;
    for (let depth = 0; depth < 4; depth++) {
      const row = await prisma.category.create({ data: { name: `SEO TEST ${run} ${depth}`, slug: `seo-${run}-category-${depth}`, parentId: categories.at(-1) } });
      categories.push(row.id); if (!depth) rootSlug = row.slug; leafSlug = row.slug;
    }
    const live = await makeProduct('published', 'ACTIVE'); liveId = live.id; liveSlug = live.slug;
    draftSlug = (await makeProduct('draft', 'DRAFT')).slug;
    archivedSlug = (await makeProduct('archived', 'ARCHIVED')).slug;
    await makeProduct('inactive-sku', 'ACTIVE', false);
  });
  afterAll(async () => {
    await prisma.productVariant.deleteMany({ where: { productId: { in: products } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    for (const id of categories.toReversed()) await prisma.category.delete({ where: { id } });
    if (brandId) await prisma.brand.delete({ where: { id: brandId } });
    await prisma.$disconnect();
  });
  const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]!);
  const filename = (url: string) => new URL(url).pathname.split('/').at(-1)!;

  it('advertises one configured origin, published products and all category ancestors without stock fabrication', async () => {
    const index = (await service.index()).body.toString();
    expect(index).toContain('<sitemapindex'); expect(index).not.toMatch(/undefined|localhost|__Host-/);
    const urls: string[] = [];
    for (const shard of locations(index)) {
      expect(shard.startsWith('https://iraniyaragh.com/sitemaps/')).toBe(true);
      const artifact = await service.shard(filename(shard)); expect(artifact.contentType).toBe('application/gzip');
      urls.push(...locations(gunzipSync(artifact.body).toString()));
    }
    expect(urls).toContain(`https://iraniyaragh.com/products/${liveSlug}`);
    expect(urls).toContain(`https://iraniyaragh.com/categories/${rootSlug}`);
    expect(urls).toContain(`https://iraniyaragh.com/categories/${leafSlug}`);
    expect(urls).not.toContain(`https://iraniyaragh.com/products/${draftSlug}`);
    expect(urls).not.toContain(`https://iraniyaragh.com/products/${archivedSlug}`);
    expect(urls.some(url => /\/account|\/checkout|\/cart|\/admin|\/api\//u.test(url))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
    expect(await prisma.inventoryBalance.count({ where: { variant: { productId: liveId } } })).toBe(0);
  });
  it('shares indexability with public rendering, including ancestor categories and out-of-stock products', async () => {
    expect(await service.catalogPolicy('products', liveSlug)).toEqual({ data: { indexable: true, canonicalPath: `/products/${liveSlug}` } });
    expect(await service.catalogPolicy('categories', rootSlug)).toEqual({ data: { indexable: true, canonicalPath: `/categories/${rootSlug}` } });
    await expect(service.catalogPolicy('products', draftSlug)).rejects.toMatchObject({ status: 404 });
    await expect(service.catalogPolicy('products', archivedSlug)).rejects.toMatchObject({ status: 404 });
    await expect(service.catalogPolicy('products', '../admin')).rejects.toMatchObject({ status: 404 });
    await expect(service.shard('products-invalid.xml.gz')).rejects.toMatchObject({ status: 404 });
    const robots = service.robots().body.toString(); expect(robots).toContain('Sitemap: https://iraniyaragh.com/sitemap.xml');
    const preview = new DiscoveryService(prisma, new ConfigService({ NODE_ENV: 'staging', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' }));
    expect(preview.robots().body.toString()).toBe('User-agent: *\nDisallow: /\n');
  });
  it('revalidates an old shard after archival rather than serving stale public URLs', async () => {
    const oldIndex = (await service.index()).body.toString();
    await prisma.product.update({ where: { id: liveId }, data: { status: 'ARCHIVED' } });
    for (const url of locations(oldIndex).filter(url => url.includes('/products-'))) {
      try { expect(gunzipSync((await service.shard(filename(url))).body).toString()).not.toContain(liveSlug); }
      catch (error) { expect(error).toMatchObject({ status: 404 }); }
    }
    await expect(service.catalogPolicy('products', liveSlug)).rejects.toMatchObject({ status: 404 });
    expect((await service.catalogPolicy('categories', rootSlug)).data.indexable).toBe(false);
  });
});
