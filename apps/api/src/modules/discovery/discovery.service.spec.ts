import { gunzipSync } from 'node:zlib';
import { ConfigService } from '@nestjs/config';
import { HELP_TOPIC_SLUGS } from '@iranyaragh/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { DiscoveryService } from './discovery.service';
import { HELP_TOPIC_SLUGS as API_HELP_TOPIC_SLUGS } from './help-topic-slugs';

describe('static sitemap destinations', () => {
  it('uses the same public help routes as the storefront contract', () => {
    expect(API_HELP_TOPIC_SLUGS).toEqual(HELP_TOPIC_SLUGS);
  });
  it('excludes unapproved noindex policies and private or redirected routes', async () => {
    const service = new DiscoveryService({ blogPost: { count: async () => 0 } } as unknown as PrismaService, new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' }));
    const shard = await service.shard('pages-home.xml.gz');
    const xml = gunzipSync(shard.body).toString('utf8');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]);
    expect(urls).toEqual(['https://iraniyaragh.com/', 'https://iraniyaragh.com/shop', 'https://iraniyaragh.com/catalog', 'https://iraniyaragh.com/categories', 'https://iraniyaragh.com/custom-doors', 'https://iraniyaragh.com/help', 'https://iraniyaragh.com/about', 'https://iraniyaragh.com/contact', ...HELP_TOPIC_SLUGS.map(slug => `https://iraniyaragh.com/help/${slug}`)]);
    expect(urls.join('\n')).not.toMatch(/policies|privacy|terms|https:\/\/iraniyaragh\.com\/(?:account|checkout)(?:$|\n)|\?|#/u);
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


describe('bounded blog sitemap ranges', () => {
  const config = new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' });
  it('partitions more than 10,000 live articles without gaps, duplicates or an unavailable shard', async () => {
    const articles = Array.from({ length: 10_001 }, (_, index) => ({
      id: `b${String(index).padStart(6, '0')}`, slug: `article-${index}`,
      contentUpdatedAt: new Date('2026-11-01T08:00:00Z'), coverMedia: null,
    }));
    const findMany = vi.fn(async ({ where, take }: { where: { id?: { gt?: string; lte?: string }; status: string; publishedAt: { lte: Date } }; take: number }) => {
      expect(where.status).toBe('PUBLISHED');
      expect(where.publishedAt.lte).toBeInstanceOf(Date);
      return articles.filter(row => (!where.id?.gt || row.id > where.id.gt) && (!where.id?.lte || row.id <= where.id.lte)).slice(0, take);
    });
    const tx = { product: { findMany: async () => [] }, brand: { findMany: async () => [] }, $queryRaw: async () => [], blogPost: { findMany } };
    const prisma = { ...tx, $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, config);
    const index = (await service.index()).body.toString();
    const shards = [...index.matchAll(/<loc>[^<]*\/sitemaps\/(blog-[^<]+)<\/loc>/gu)].map(match => match[1]!);
    expect(shards).toHaveLength(11);
    expect(index).not.toContain('blog-posts.xml.gz');
    const locations: string[] = [];
    for (const filename of shards) {
      const xml = gunzipSync((await service.shard(filename)).body).toString();
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]!);
      expect(urls.length).toBeLessThanOrEqual(1_000);
      expect(xml).toContain('<lastmod>2026-11-01T08:00:00.000Z</lastmod>');
      locations.push(...urls);
    }
    expect(locations).toHaveLength(articles.length);
    expect(new Set(locations).size).toBe(articles.length);
    expect(locations.at(-1)).toBe('https://iraniyaragh.com/blog/article-10000');
  });

  it('rechecks publication on a saved range and rejects malformed ranges', async () => {
    const findMany = vi.fn(async () => []);
    const service = new DiscoveryService({ blogPost: { findMany } } as unknown as PrismaService, config);
    const range = Buffer.from(JSON.stringify({ after: 'b001', through: 'b005' })).toString('base64url');
    await expect(service.shard(`blog-${range}.xml.gz`)).rejects.toMatchObject({ status: 404 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PUBLISHED', publishedAt: { lte: expect.any(Date) }, id: { gt: 'b001', lte: 'b005' } } }));
    findMany.mockClear();
    await expect(service.shard('blog-invalid.xml.gz')).rejects.toMatchObject({ status: 404 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
