import { gunzipSync } from 'node:zlib';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { DiscoveryService } from './discovery.service';

describe('static sitemap destinations', () => {
  it('excludes unapproved noindex policies and private or redirected routes', async () => {
    const service = new DiscoveryService({} as PrismaService, new ConfigService({ NODE_ENV: 'production', PUBLIC_WEB_ORIGIN: 'https://iraniyaragh.com' }));
    const shard = await service.shard('pages-home.xml.gz');
    const xml = gunzipSync(shard.body).toString('utf8');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1]);
    expect(urls).toEqual(['https://iraniyaragh.com/', 'https://iraniyaragh.com/catalog', 'https://iraniyaragh.com/categories']);
    expect(urls.join('\n')).not.toMatch(/policies|privacy|terms|account|checkout|\?|#/u);
  });
});
