import { createHash } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DISCOVERY_KINDS, escapeXml, isCanonicalSlug, isDiscoveryKind, parsePublicWebOrigin, SITEMAP_NAMESPACE, XML_HEADER, type DiscoveryKind } from './discovery.policy';

const compress = promisify(gzip);
export const DISCOVERY_SHARD_TARGET = 1_000;
const MAX_SHARD_URLS = 10_000;
const MAX_INDEX_SHARDS = 1_000;
const MAX_XML_BYTES = 50 * 1024 * 1024;
// Same published lifecycle as public catalog, narrowed to sellable active variants.
const productEligibility: Prisma.ProductWhereInput = { status: 'ACTIVE', variants: { some: { isActive: true, status: 'ACTIVE' } } };
const landingEligibility = { products: { some: productEligibility } };
type Range = { after: string; through: string };
type Row = { id: string; slug: string };
export type DiscoveryArtifact = { body: Buffer; etag: string; contentType: string };

function encodeRange(range: Range): string { return Buffer.from(JSON.stringify(range)).toString('base64url'); }
function decodeRange(value: string): Range {
  try {
    if (!/^[A-Za-z0-9_-]{1,320}$/u.test(value)) throw new Error();
    const range = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Range;
    const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(id);
    if (!(range.after === '' || validId(range.after)) || !validId(range.through)
      || (range.after && range.after >= range.through) || encodeRange(range) !== value) throw new Error();
    return range;
  } catch { throw new NotFoundException('Unknown sitemap shard.'); }
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly inflight = new Map<string, Promise<DiscoveryArtifact>>();
  readonly origin: string | undefined;
  readonly production: boolean;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) config: ConfigService) {
    this.production = config.get<string>('NODE_ENV') === 'production';
    this.origin = parsePublicWebOrigin(config.get('PUBLIC_WEB_ORIGIN'), config.get<string>('NODE_ENV') ?? 'development');
  }

  robots(): DiscoveryArtifact {
    const text = this.production
      ? `User-agent: *\nAllow: /\n\nSitemap: ${this.origin}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n';
    return this.artifact(Buffer.from(text), 'text/plain; charset=utf-8');
  }

  async index(): Promise<DiscoveryArtifact> {
    return this.singleflight('index', async () => {
      const origin = this.requireOrigin();
      // A repeatable snapshot prevents duplicate/gapped ranges during concurrent publication.
      const paths = await this.prisma.$transaction(async tx => {
        const shards: string[] = ['/sitemaps/pages-home.xml.gz'];
        for (const kind of DISCOVERY_KINDS) {
          let after = '';
          for (;;) {
            const rows = await this.rows(tx, kind, { after }, DISCOVERY_SHARD_TARGET);
            if (!rows.length) break;
            const through = rows[rows.length - 1]!.id;
            if (rows.some(row => isCanonicalSlug(row.slug))) {
              shards.push(`/sitemaps/${kind}-${encodeRange({ after, through })}.xml.gz`);
              if (shards.length > MAX_INDEX_SHARDS) throw new Error('Discovery index capacity exceeded.');
            }
            after = through;
            if (rows.length < DISCOVERY_SHARD_TARGET) break;
          }
        }
        return shards;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
      const xml = `${XML_HEADER}<sitemapindex xmlns="${SITEMAP_NAMESPACE}">${paths.map(path => `<sitemap><loc>${escapeXml(origin + path)}</loc></sitemap>`).join('')}</sitemapindex>`;
      return this.artifact(Buffer.from(xml), 'application/xml; charset=utf-8');
    });
  }

  async shard(filename: string): Promise<DiscoveryArtifact> {
    if (filename === 'pages-home.xml.gz') {
      // Policy text still awaits business approval and its HTML is noindex.
      // Only canonical, indexable public destinations belong in the sitemap.
      return this.singleflight(filename, () => this.urlset(['/', '/catalog', '/categories'].map(path => ({ path }))));
    }
    const match = /^(products|categories|brands)-([A-Za-z0-9_-]{1,320})\.xml\.gz$/u.exec(filename);
    if (!match || !isDiscoveryKind(match[1]!)) throw new NotFoundException('Unknown sitemap shard.');
    const kind = match[1];
    const range = decodeRange(match[2]!);
    return this.singleflight(filename, async () => {
      const rows = await this.rows(this.prisma, kind, range, MAX_SHARD_URLS + 1);
      if (rows.length > MAX_SHARD_URLS) throw new Error('Discovery shard requires repartitioning.');
      const urls = rows.filter(row => isCanonicalSlug(row.slug)).map(row => ({ path: `/${kind}/${encodeURIComponent(row.slug)}` }));
      if (!urls.length) throw new NotFoundException('Empty sitemap shard.');
      return this.urlset(urls);
    });
  }

  async catalogPolicy(kind: string, slug: string): Promise<{ data: { indexable: boolean; canonicalPath: string } }> {
    if (!isDiscoveryKind(kind) || !isCanonicalSlug(slug)) throw new NotFoundException('Unknown public page.');
    let exists: boolean;
    let indexable: boolean;
    if (kind === 'products') {
      const row = await this.prisma.product.findFirst({ where: { slug, status: 'ACTIVE' }, select: { id: true, variants: { where: { isActive: true, status: 'ACTIVE' }, select: { id: true }, take: 1 } } });
      exists = Boolean(row);
      indexable = Boolean(row?.variants.length);
    } else if (kind === 'categories') {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; indexable: boolean }>>`
        WITH RECURSIVE selected AS (SELECT id FROM "Category" WHERE slug=${slug}),
        descendants(id) AS (SELECT id FROM selected UNION SELECT c.id FROM "Category" c JOIN descendants d ON c."parentId"=d.id)
        SELECT s.id, EXISTS(SELECT 1 FROM "Product" p JOIN descendants d ON p."categoryId"=d.id
          WHERE p.status='ACTIVE' AND EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND v."isActive" AND v.status='ACTIVE')) AS indexable
        FROM selected s`;
      exists = rows.length > 0;
      indexable = rows[0]?.indexable ?? false;
    } else {
      const row = await this.prisma.brand.findUnique({ where: { slug }, select: { id: true, products: { where: productEligibility, select: { id: true }, take: 1 } } });
      exists = Boolean(row);
      indexable = Boolean(row?.products.length);
    }
    if (!exists) throw new NotFoundException('Unknown public page.');
    return { data: { indexable, canonicalPath: `/${kind}/${encodeURIComponent(slug)}` } };
  }

  private rows(tx: Prisma.TransactionClient, kind: DiscoveryKind, range: { after: string; through?: string }, take: number): Promise<Row[]> {
    const id = { ...(range.after ? { gt: range.after } : {}), ...(range.through ? { lte: range.through } : {}) };
    const common = { select: { id: true, slug: true }, orderBy: { id: 'asc' as const }, take };
    if (kind === 'products') return tx.product.findMany({ ...common, where: { ...productEligibility, id } });
    if (kind === 'categories') return tx.$queryRaw<Row[]>(Prisma.sql`
      WITH RECURSIVE eligible(id) AS (
        SELECT p."categoryId" FROM "Product" p WHERE p."categoryId" IS NOT NULL AND p.status='ACTIVE'
          AND EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND v."isActive" AND v.status='ACTIVE')
        UNION SELECT c."parentId" FROM "Category" c JOIN eligible e ON c.id=e.id WHERE c."parentId" IS NOT NULL
      ) SELECT c.id,c.slug FROM "Category" c JOIN eligible e ON e.id=c.id
        WHERE TRUE ${range.after ? Prisma.sql`AND c.id>${range.after}` : Prisma.empty}
        ${range.through ? Prisma.sql`AND c.id<=${range.through}` : Prisma.empty}
        ORDER BY c.id ASC LIMIT ${take}`);
    return tx.brand.findMany({ ...common, where: { ...landingEligibility, id } });
  }

  private requireOrigin(): string {
    if (!this.origin) throw new ServiceUnavailableException('PUBLIC_WEB_ORIGIN has not been configured.');
    return this.origin;
  }

  private async urlset(urls: { path: string }[]): Promise<DiscoveryArtifact> {
    const origin = this.requireOrigin();
    // No lastmod until there is an authoritative significant-content timestamp:
    // product.updatedAt alone misses variant/media changes; request time would lie.
    const xml = `${XML_HEADER}<urlset xmlns="${SITEMAP_NAMESPACE}">${urls.map(url => `<url><loc>${escapeXml(origin + url.path)}</loc></url>`).join('')}</urlset>`;
    const buffer = Buffer.from(xml);
    if (buffer.length > MAX_XML_BYTES) throw new Error('Discovery XML size exceeded.');
    return this.artifact(await compress(buffer), 'application/gzip');
  }

  private artifact(body: Buffer, contentType: string): DiscoveryArtifact {
    return { body, contentType, etag: `"${createHash('sha256').update(body).digest('base64url')}"` };
  }

  private async singleflight(key: string, generate: () => Promise<DiscoveryArtifact>): Promise<DiscoveryArtifact> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    if (this.inflight.size >= 4) throw new ServiceUnavailableException('Discovery generation is busy.');
    const started = Date.now();
    const pending = generate().catch((error: unknown) => {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      this.logger.error('Discovery generation failed; no partial or stale catalog artifact was served.');
      throw new ServiceUnavailableException('Discovery is temporarily unavailable.');
    }).finally(() => {
      this.inflight.delete(key);
      this.logger.debug(`Discovery generation completed in ${Date.now() - started}ms.`);
    });
    this.inflight.set(key, pending);
    return pending;
  }
}
