import { gunzipSync } from 'node:zlib';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { DiscoveryService } from './discovery.service';

describe('static sitemap destinations', () => {
  it('excludes unapproved noindex policies and private or redirected routes', async () => {
    const service = new DiscoveryService({ blogPost: { count: async () => 0 } } as unknown as PrismaService, new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' }));
    const shard = await service.shard('pages-home.xml.gz');
    const xml = gunzipSync(shard.body).toString('utf8');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]);
    expect(urls).toEqual(['https://iraniyaragh.com/', 'https://iraniyaragh.com/catalog', 'https://iraniyaragh.com/categories', 'https://iraniyaragh.com/custom-doors', 'https://iraniyaragh.com/help']);
    expect(urls.join('\n')).not.toMatch(/policies|privacy|terms|account|checkout|\?|#/u);
  });
});

describe('robots policy', () => {
  it('keeps the API namespace out of the crawl and advertises the canonical sitemap index', () => {
    const service = new DiscoveryService({} as PrismaService, new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' }));
    const text = service.robots().body.toString('utf8');
    expect(text).toContain('Disallow: /api/');
    expect(text).toContain('Allow: /');
    expect(text).toMatch(/^Sitemap: https:\/\/iraniyaragh\.com\/sitemap\.xml$/mu);
    // Private pages rely on noindex, which crawlers can only see if they are not robots-blocked.
    expect(text).not.toMatch(/Disallow: \/(?:account|cart|checkout|orders|payment|search)/u);
  });
});

describe('blog sitemap', () => {
  const config = new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com', PUBLIC_MEDIA_ORIGIN: 'https://media.iraniyaragh.com/products' });
  it('lists /blog and live articles with the last significant change as lastmod', async () => {
    const prisma = { blogPost: { count: async () => 1, findMany: async () => [{ slug: 'راهنمای-انتخاب-لولا', contentUpdatedAt: new Date('2026-11-01T08:00:00Z'), coverMedia: { state: 'READY', renditions: [{ objectKey: 'p/small.webp', width: 400, height: 300 }, { objectKey: 'p/big.webp', width: 1200, height: 900 }] } }] } } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, config);
    const pages = gunzipSync((await service.shard('pages-home.xml.gz')).body).toString('utf8');
    expect(pages).toContain('<loc>https://iraniyaragh.com/blog</loc>');
    const xml = gunzipSync((await service.shard('blog-posts.xml.gz')).body).toString('utf8');
    expect(xml).toContain(`<loc>https://iraniyaragh.com/blog/${encodeURIComponent('راهنمای-انتخاب-لولا')}</loc><lastmod>2026-11-01T08:00:00.000Z</lastmod>`);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain('<image:image><image:loc>https://media.iraniyaragh.com/products/p/big.webp</image:loc></image:image>');
  });
  it('omits /blog and the blog shard when nothing is live', async () => {
    const prisma = { blogPost: { count: async () => 0, findMany: async () => [] } } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, config);
    expect(gunzipSync((await service.shard('pages-home.xml.gz')).body).toString('utf8')).not.toContain('/blog');
    await expect(service.shard('blog-posts.xml.gz')).rejects.toThrow();
  });
});

describe('product image sitemap', () => {
  it('attaches only the first ready image per product (by gallery position) and none when absent', async () => {
    const config = new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com', PUBLIC_MEDIA_ORIGIN: 'https://media.iraniyaragh.com/products' });
    const rendition = (key: string) => [{ objectKey: key, width: 800, height: 600 }];
    const prisma = {
      product: { findMany: async () => [{ id: 'p1', slug: 'hinge' }, { id: 'p2', slug: 'rail' }] },
      productMedia: { findMany: async () => [{ productId: 'p1', position: 1, renditions: rendition('p1/first.webp') }, { productId: 'p1', position: 2, renditions: rendition('p1/second.webp') }] },
    } as unknown as PrismaService;
    const range = Buffer.from(JSON.stringify({ after: '', through: 'p2' })).toString('base64url');
    const xml = gunzipSync((await new DiscoveryService(prisma, config).shard(`products-${range}.xml.gz`)).body).toString('utf8');
    expect(xml).toContain('<loc>https://iraniyaragh.com/products/hinge</loc><image:image><image:loc>https://media.iraniyaragh.com/products/p1/first.webp</image:loc></image:image>');
    expect(xml).not.toContain('second.webp');
    expect(xml).toContain('<loc>https://iraniyaragh.com/products/rail</loc></url>');
  });
});
