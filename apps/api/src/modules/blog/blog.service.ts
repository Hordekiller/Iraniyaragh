import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type BlogPost, type BlogPostStatus, type ProductMedia, type ProductMediaRendition, type User } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  BlogImage, BlogMediaOption, BlogPostAdmin, BlogPostAdminSummary, BlogPostInput, BlogPublicList, BlogPublicPost, BlogPublicPostResult,
  BlogPublicSummary, BlogRevisionSummary, BlogSource, BlogTransitionRequest,
} from '@iranyaragh/contracts';
import type { EnvironmentVariables } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { widestRenditionProjection } from '../media/media-url';
import { isCanonicalSlug } from '../discovery/discovery.policy';
import { publishBlockers, readingMinutes, significantlyChanged, validateBlogInput, type ValidatedBlogInput } from './blog.validation';

// Keep in sync with BLOG_PAGE_SIZE in contracts (value imports from the unbuilt package crash compiled Node).
export const BLOG_PAGE_SIZE = 12;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Tx = Prisma.TransactionClient;
type PostRow = BlogPost & { coverMedia: (ProductMedia & { renditions: ProductMediaRendition[] }) | null; author: Pick<User, 'firstName' | 'lastName' | 'mobile'>; reviewer: Pick<User, 'firstName' | 'lastName' | 'mobile'> | null };
const include = { coverMedia: { include: { renditions: true } }, author: { select: { firstName: true, lastName: true, mobile: true } }, reviewer: { select: { firstName: true, lastName: true, mobile: true } } } satisfies Prisma.BlogPostInclude;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 8000, maxWait: 3000 } as const;

const personName = (user: { firstName: string | null; lastName: string | null } | null) => user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || null : null;
const iso = (date: Date | null) => date?.toISOString() ?? null;

/** Allowed workflow edges and the permission each one needs. */
export const TRANSITIONS: Record<BlogTransitionRequest['action'], { from: BlogPostStatus[]; to: BlogPostStatus; permission: 'blog.write' | 'blog.publish' }> = {
  submit: { from: ['DRAFT'], to: 'IN_REVIEW', permission: 'blog.write' },
  'return-to-draft': { from: ['IN_REVIEW'], to: 'DRAFT', permission: 'blog.publish' },
  publish: { from: ['DRAFT', 'IN_REVIEW', 'ARCHIVED'], to: 'PUBLISHED', permission: 'blog.publish' },
  unpublish: { from: ['PUBLISHED'], to: 'DRAFT', permission: 'blog.publish' },
  archive: { from: ['DRAFT', 'IN_REVIEW', 'PUBLISHED'], to: 'ARCHIVED', permission: 'blog.publish' },
};

@Injectable()
export class BlogService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService<EnvironmentVariables, true>,
  ) {}

  private get origin(): string { return this.config?.get('PUBLIC_MEDIA_ORIGIN', { infer: true }) ?? 'http://localhost:9000/products'; }

  private cover(row: Pick<PostRow, 'coverMedia' | 'coverAlt'>): BlogImage | null {
    const projection = row.coverMedia?.state === 'READY' ? widestRenditionProjection(this.origin, row.coverMedia.renditions) : null;
    return projection ? { ...projection, alt: row.coverAlt ?? '' } : null;
  }

  private source(row: Pick<BlogPost, 'sources'>): BlogSource[] { return row.sources as unknown as BlogSource[]; }

  private admin(row: PostRow): BlogPostAdmin {
    return {
      id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, bodyHtml: row.bodyHtml, coverMediaId: row.coverMediaId, coverAlt: row.coverAlt,
      tags: row.tags, seoTitle: row.seoTitle, seoDescription: row.seoDescription, sources: this.source(row),
      status: row.status, version: row.version, authorId: row.authorId, authorName: personName(row.author), reviewerId: row.reviewerId, reviewerName: personName(row.reviewer),
      selfReviewed: row.reviewerId !== null && row.reviewerId === row.authorId,
      publishedAt: iso(row.publishedAt), contentUpdatedAt: row.contentUpdatedAt.toISOString(), archivedAt: iso(row.archivedAt),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), cover: this.cover(row),
    };
  }

  private summary(row: PostRow): BlogPublicSummary {
    return {
      slug: row.slug, title: row.title, excerpt: row.excerpt, cover: this.cover(row), tags: row.tags,
      publishedAt: row.publishedAt!.toISOString(), updatedAt: row.contentUpdatedAt.toISOString(), readingMinutes: readingMinutes(row.bodyHtml),
    };
  }

  private live(now: Date): Prisma.BlogPostWhereInput { return { status: 'PUBLISHED', publishedAt: { lte: now } }; }

  // ── Public ────────────────────────────────────────────────────────────────

  async listPublic(page: number, now = new Date()): Promise<BlogPublicList> {
    const where = this.live(now);
    const [total, rows] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({ where, include, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * BLOG_PAGE_SIZE, take: BLOG_PAGE_SIZE }),
    ]);
    return { items: rows.map(row => this.summary(row)), meta: { page, pages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)), total, perPage: BLOG_PAGE_SIZE } };
  }

  async getPublic(slug: string, now = new Date()): Promise<BlogPublicPostResult> {
    if (!isCanonicalSlug(slug)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown article.' });
    const row = await this.prisma.blogPost.findFirst({ where: { slug, ...this.live(now) }, include });
    if (row) {
      const post: BlogPublicPost = { ...this.summary(row), bodyHtml: row.bodyHtml, sources: this.source(row), seoTitle: row.seoTitle, seoDescription: row.seoDescription };
      return { post, redirectSlug: null };
    }
    const moved = await this.prisma.blogPostSlug.findUnique({ where: { slug }, include: { post: { select: { slug: true, status: true, publishedAt: true } } } });
    if (moved && moved.post.status === 'PUBLISHED' && moved.post.publishedAt && moved.post.publishedAt <= now) return { post: null, redirectSlug: moved.post.slug };
    throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown article.' });
  }

  /** Sitemap projection: only live articles, with the last significant change as lastmod. */
  async sitemapRows(now = new Date()): Promise<{ slug: string; lastmod: Date }[]> {
    const rows = await this.prisma.blogPost.findMany({ where: this.live(now), select: { slug: true, contentUpdatedAt: true }, orderBy: { id: 'asc' } });
    return rows.map(row => ({ slug: row.slug, lastmod: row.contentUpdatedAt }));
  }

  // ── Admin reads ───────────────────────────────────────────────────────────

  async listAdmin(query: { status?: BlogPostStatus; q?: string; page: number }) {
    const where: Prisma.BlogPostWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { slug: { contains: query.q, mode: 'insensitive' } }] } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({ where, include: { author: include.author }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * 20, take: 20 }),
    ]);
    const items: BlogPostAdminSummary[] = rows.map(row => ({ id: row.id, slug: row.slug, title: row.title, status: row.status, version: row.version, authorName: personName(row.author), publishedAt: iso(row.publishedAt), updatedAt: row.updatedAt.toISOString() }));
    return { items, meta: { page: query.page, pages: Math.max(1, Math.ceil(total / 20)), total, perPage: 20 } };
  }

  async getAdmin(id: string): Promise<BlogPostAdmin> {
    const row = await this.prisma.blogPost.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown article.' });
    return this.admin(row);
  }

  async revisions(id: string): Promise<BlogRevisionSummary[]> {
    const rows = await this.prisma.blogPostRevision.findMany({ where: { postId: id }, orderBy: { version: 'desc' }, take: 100, include: { actor: { select: { firstName: true, lastName: true } } } });
    return rows.map(row => {
      const snapshot = row.snapshot as unknown as { title: string; status: BlogPostStatus };
      return { version: row.version, actorName: personName(row.actor), createdAt: row.createdAt.toISOString(), title: snapshot.title, status: snapshot.status };
    });
  }

  async mediaOptions(): Promise<BlogMediaOption[]> {
    const rows = await this.prisma.productMedia.findMany({ where: { state: 'READY', kind: 'IMAGE' }, orderBy: { createdAt: 'desc' }, take: 60, include: { renditions: true, product: { select: { name: true } } } });
    return rows.flatMap(row => { const p = widestRenditionProjection(this.origin, row.renditions); return p ? [{ id: row.id, ...p, alt: row.altText ?? '', productName: row.product.name }] : []; });
  }

  // ── Admin writes ──────────────────────────────────────────────────────────

  private async assertCover(tx: Tx, input: ValidatedBlogInput): Promise<void> {
    if (!input.coverMediaId) return;
    const media = await tx.productMedia.findFirst({ where: { id: input.coverMediaId, state: 'READY', kind: 'IMAGE' }, select: { id: true } });
    if (!media) throw new BadRequestException({ code: 'INVALID_MEDIA', message: 'The cover must be a ready, processed image.' });
  }

  private async assertSlugFree(tx: Tx, slug: string, postId: string | null): Promise<void> {
    const [post, old] = await Promise.all([tx.blogPost.findUnique({ where: { slug }, select: { id: true } }), tx.blogPostSlug.findUnique({ where: { slug }, select: { postId: true } })]);
    if ((post && post.id !== postId) || (old && old.postId !== postId)) throw new ConflictException({ code: 'SLUG_TAKEN', message: 'This slug is already used by another article.' });
  }

  private snapshot(row: BlogPost) {
    return { slug: row.slug, title: row.title, excerpt: row.excerpt, bodyHtml: row.bodyHtml, coverMediaId: row.coverMediaId, coverAlt: row.coverAlt, tags: row.tags, seoTitle: row.seoTitle, seoDescription: row.seoDescription, sources: row.sources, status: row.status } as unknown as Prisma.InputJsonObject;
  }

  /** Runs `work` once per (actor, key); a replay with the same payload returns the stored response. */
  private async command<T extends BlogPostAdmin>(actorId: string, key: string, payload: unknown, work: (tx: Tx) => Promise<T>): Promise<T> {
    const keyHash = digest(key);
    const payloadHash = digest(JSON.stringify(payload));
    try {
      return await this.prisma.$transaction(async tx => {
        const replay = await tx.blogCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
        if (replay) {
          if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to a different article change.' });
          return replay.response as unknown as T;
        }
        const result = await work(tx);
        await tx.blogCommand.create({ data: { actorId, keyHash, payloadHash, response: result as unknown as Prisma.InputJsonObject } });
        return result;
      }, SERIALIZABLE);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException({ code: 'CONCURRENT_UPDATE', message: 'The article changed at the same time; reload and retry.' });
      throw error;
    }
  }

  async create(actorId: string, requestId: string, raw: BlogPostInput, key: string): Promise<BlogPostAdmin> {
    const input = validateBlogInput(raw);
    return this.command(actorId, key, { op: 'create', input }, async tx => {
      await this.assertSlugFree(tx, input.slug, null);
      await this.assertCover(tx, input);
      const row = await tx.blogPost.create({ data: { ...input, sources: input.sources as unknown as Prisma.InputJsonValue, authorId: actorId }, include });
      await tx.blogPostRevision.create({ data: { postId: row.id, version: row.version, snapshot: this.snapshot(row), actorId } });
      const result = this.admin(row);
      await this.audit.record({ actorId, requestId, action: 'blog.post.created', entityType: 'blog_post', entityId: row.id, after: { slug: row.slug, title: row.title, status: row.status } }, tx);
      return result;
    });
  }

  async update(actorId: string, permissions: ReadonlySet<string>, requestId: string, id: string, expectedVersion: number, raw: BlogPostInput, key: string): Promise<BlogPostAdmin> {
    const input = validateBlogInput(raw);
    return this.command(actorId, key, { op: 'update', id, expectedVersion, input }, async tx => {
      const current = await tx.blogPost.findUnique({ where: { id }, include });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown article.' });
      if (current.version !== expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'The article changed; reload before saving.' });
      // Editing live or archived content changes what search engines index: publishers only.
      if ((current.status === 'PUBLISHED' || current.status === 'ARCHIVED') && !permissions.has('blog.publish')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Editing a published article requires the publish permission.' });
      if (current.status === 'PUBLISHED' && publishBlockers(input).length) throw new BadRequestException({ code: 'INVALID_REQUEST', message: publishBlockers(input).join(' ') });
      await this.assertSlugFree(tx, input.slug, id);
      await this.assertCover(tx, input);
      const before = { ...current, sources: this.source(current), tags: current.tags } as unknown as ValidatedBlogInput;
      const changed = significantlyChanged(before, input);
      // Once an article has been public, its old URL keeps redirecting (one hop) after a rename.
      if (current.slug !== input.slug && current.publishedAt) await tx.blogPostSlug.upsert({ where: { slug: current.slug }, update: { postId: id }, create: { slug: current.slug, postId: id } });
      // Renaming back must not leave the live slug listed as a redirect to itself.
      await tx.blogPostSlug.deleteMany({ where: { slug: input.slug, postId: id } });
      const row = await tx.blogPost.update({ where: { id }, data: { ...input, sources: input.sources as unknown as Prisma.InputJsonValue, version: { increment: 1 }, ...(changed ? { contentUpdatedAt: new Date() } : {}) }, include });
      await tx.blogPostRevision.create({ data: { postId: id, version: row.version, snapshot: this.snapshot(row), actorId } });
      await this.audit.record({ actorId, requestId, action: 'blog.post.updated', entityType: 'blog_post', entityId: id, before: { version: current.version, slug: current.slug, title: current.title }, after: { version: row.version, slug: row.slug, title: row.title } }, tx);
      return this.admin(row);
    });
  }

  async transition(actorId: string, permissions: ReadonlySet<string>, requestId: string, id: string, request: BlogTransitionRequest, key: string): Promise<BlogPostAdmin> {
    const edge = TRANSITIONS[request.action];
    if (!edge || !Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 1) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Unknown action or version.' });
    if (!permissions.has(edge.permission)) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role cannot perform this step.' });
    let publishAt: Date | null = null;
    if (request.action === 'publish' && request.publishAt) {
      publishAt = new Date(request.publishAt);
      if (Number.isNaN(publishAt.getTime())) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Publish time is invalid.' });
    }
    return this.command(actorId, key, { op: 'transition', id, request }, async tx => {
      const current = await tx.blogPost.findUnique({ where: { id }, include });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown article.' });
      if (current.version !== request.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'The article changed; reload first.' });
      if (!edge.from.includes(current.status)) throw new ConflictException({ code: 'INVALID_TRANSITION', message: `An article in ${current.status} cannot ${request.action}.` });
      const data: Prisma.BlogPostUncheckedUpdateInput = { status: edge.to, version: { increment: 1 } };
      if (request.action === 'publish') {
        const blockers = publishBlockers(current);
        if (blockers.length) throw new BadRequestException({ code: 'PUBLISH_BLOCKED', message: blockers.join(' ') });
        const cover = this.cover(current);
        if (current.coverMediaId && !cover) throw new BadRequestException({ code: 'INVALID_MEDIA', message: 'The cover image is not ready.' });
        // Publishing is the review sign-off; it is recorded even when the author signs off alone (selfReviewed).
        data.reviewerId = actorId;
        data.publishedAt = publishAt ?? current.publishedAt ?? new Date();
        data.archivedAt = null;
        data.contentUpdatedAt = new Date();
      } else if (request.action === 'archive') data.archivedAt = new Date();
      else if (request.action === 'unpublish') data.publishedAt = null;
      const row = await tx.blogPost.update({ where: { id }, data, include });
      await tx.blogPostRevision.create({ data: { postId: id, version: row.version, snapshot: this.snapshot(row), actorId } });
      await this.audit.record({ actorId, requestId, action: `blog.post.${request.action.replaceAll('-', '_')}`, entityType: 'blog_post', entityId: id, before: { status: current.status, version: current.version }, after: { status: row.status, version: row.version, selfReviewed: row.reviewerId === row.authorId && request.action === 'publish' } }, tx);
      return this.admin(row);
    });
  }
}
