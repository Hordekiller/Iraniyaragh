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
  const config = new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' });
  it('lists /blog and live articles with the last significant change as lastmod', async () => {
    const prisma = { blogPost: { count: async () => 1, findMany: async () => [{ slug: 'راهنمای-انتخاب-لولا', contentUpdatedAt: new Date('2026-11-01T08:00:00Z') }] } } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, config);
    const pages = gunzipSync((await service.shard('pages-home.xml.gz')).body).toString('utf8');
    expect(pages).toContain('<loc>https://iraniyaragh.com/blog</loc>');
    const xml = gunzipSync((await service.shard('blog-posts.xml.gz')).body).toString('utf8');
    expect(xml).toContain(`<loc>https://iraniyaragh.com/blog/${encodeURIComponent('راهنمای-انتخاب-لولا')}</loc><lastmod>2026-11-01T08:00:00.000Z</lastmod>`);
  });
  it('omits /blog and the blog shard when nothing is live', async () => {
    const prisma = { blogPost: { count: async () => 0, findMany: async () => [] } } as unknown as PrismaService;
    const service = new DiscoveryService(prisma, config);
    expect(gunzipSync((await service.shard('pages-home.xml.gz')).body).toString('utf8')).not.toContain('/blog');
    await expect(service.shard('blog-posts.xml.gz')).rejects.toThrow();
  });
});
