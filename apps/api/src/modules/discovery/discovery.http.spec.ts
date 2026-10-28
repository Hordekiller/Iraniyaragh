import 'reflect-metadata';
import { HttpException, Module, ServiceUnavailableException, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { DiscoveryRateLimitService } from './discovery-rate-limit.service';

const body = '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>';
const artifact = { body: Buffer.from(body), etag: '"test-current-snapshot"', contentType: 'application/xml; charset=utf-8' };
const domain = { production: true, index: vi.fn(async () => artifact), shard: vi.fn(async () => artifact), robots: vi.fn(() => ({ ...artifact, body: Buffer.from('User-agent: *\nAllow: /\n'), contentType: 'text/plain; charset=utf-8' })), catalogPolicy: vi.fn(async () => ({ data: { indexable: true, canonicalPath: '/products/test' } })) };
const limiter = { enforce: vi.fn(async () => {}) };
@Module({ imports: [ApiFoundationModule], controllers: [DiscoveryController], providers: [{ provide: DiscoveryService, useValue: domain }, { provide: DiscoveryRateLimitService, useValue: limiter }] }) class DiscoveryHttpModule {}

describe('public discovery HTTP boundary', () => {
  let app: NestExpressApplication, origin: string;
  const request = (path = '/sitemap.xml', headers = {}) => fetch(`${origin}/api/v1/discovery${path}`, { headers });
  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(DiscoveryHttpModule, { logger: false });
    app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => { vi.clearAllMocks(); domain.production = true; });
  afterAll(async () => app.close());
  it('serves XML with current validators and never trusts request hosts for generation', async () => {
    const response = await request('/sitemap.xml', { 'X-Forwarded-Host': 'attacker.example' });
    expect(response.status).toBe(200); expect(await response.text()).toBe(body);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(response.headers.get('etag')).toBe(artifact.etag);
    expect(response.headers.get('cache-control')).toBe('public, no-cache, must-revalidate');
    expect(domain.index).toHaveBeenCalledWith(); expect(limiter.enforce).toHaveBeenCalledOnce();
  });
  it('revalidates data before returning 304, including weak and multi-value validators', async () => {
    const response = await request('/sitemap.xml', { 'If-None-Match': '"older", W/'+artifact.etag });
    expect(response.status).toBe(304); expect(await response.text()).toBe(''); expect(domain.index).toHaveBeenCalledOnce();
    domain.index.mockRejectedValueOnce(new ServiceUnavailableException('Unavailable'));
    const failure = await request('/sitemap.xml', { 'If-None-Match': artifact.etag });
    expect(failure.status).toBe(503); expect(failure.headers.get('cache-control')).toBe('no-store'); expect(failure.headers.get('etag')).toBeNull();
  });
  it('fails closed on rate limits and limiter outages before querying the catalog', async () => {
    for (const error of [new HttpException('Limited', 429), new ServiceUnavailableException('Capacity unavailable')]) {
      limiter.enforce.mockRejectedValueOnce(error);
      const response = await request(); expect(response.status).toBe(error.getStatus());
      expect(response.headers.get('retry-after')).toBe('60'); expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(domain.index).not.toHaveBeenCalled();
  });
  it('prevents shared caching of authenticated requests and indexing of nonproduction responses', async () => {
    domain.production = false;
    const response = await request('/robots.txt', { Authorization: 'Bearer isolated-invalid-test' });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
  it('marks the internal public eligibility projection no-store and noindex', async () => {
    const response = await request('/catalog/products/test'); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { indexable: true, canonicalPath: '/products/test' } });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});
