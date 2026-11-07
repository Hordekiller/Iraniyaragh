import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BlogPostInput } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { BlogService } from './blog.service';

describe.sequential('Blog workflow on real PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new BlogService(prisma, new AuditLogService(prisma), new ConfigService({ PUBLIC_MEDIA_ORIGIN: 'https://media.example.com/products' }));
  const run = randomUUID().replaceAll('-', '').slice(0, 12);
  let author = '', publisher = '';
  const writer = new Set(['blog.read', 'blog.write']);
  const editor = new Set(['blog.read', 'blog.write', 'blog.publish']);
  const key = () => `k-${randomUUID()}`;
  const body = `<h2>مقدمه</h2><p>${'متن کامل و مفید دربارهٔ انتخاب یراق کابینت. '.repeat(20)}</p>`;
  const input = (suffix: string, over: Partial<BlogPostInput> = {}): BlogPostInput => ({
    slug: `blog-${run}-${suffix}`, title: `مقاله ${suffix}`, excerpt: 'خلاصهٔ پاسخ‌محور مقاله که باید دست‌کم پنجاه نویسه باشد تا انتشار مجاز شود.', bodyHtml: body,
    coverMediaId: null, coverAlt: null, tags: ['یراق'], seoTitle: null, seoDescription: null, sources: [], ...over,
  });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    author = (await prisma.user.create({ data: { mobile: `+98911${run.slice(0, 7).replace(/\D/gu, '1').padEnd(7, '1')}`, firstName: 'نویسنده', lastName: 'تست' } })).id;
    publisher = (await prisma.user.create({ data: { mobile: `+98912${run.slice(0, 7).replace(/\D/gu, '2').padEnd(7, '2')}`, firstName: 'ناشر', lastName: 'تست' } })).id;
  });
  afterAll(async () => {
    const posts = await prisma.blogPost.findMany({ where: { slug: { startsWith: `blog-${run}` } }, select: { id: true } });
    const ids = posts.map(post => post.id);
    await prisma.blogPostSlug.deleteMany({ where: { postId: { in: ids } } });
    await prisma.blogPostRevision.deleteMany({ where: { postId: { in: ids } } });
    await prisma.blogPost.deleteMany({ where: { id: { in: ids } } });
    await prisma.blogCommand.deleteMany({ where: { actorId: { in: [author, publisher] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [author, publisher] } } });
    await prisma.user.deleteMany({ where: { id: { in: [author, publisher] } } });
    await prisma.$disconnect();
  });

  it('moves draft → review → published, hides it until live, and records revisions', async () => {
    const draft = await service.create(author, 'req', input('flow'), key());
    expect(draft).toMatchObject({ status: 'DRAFT', version: 1, authorId: author });
    await expect(service.getPublic(draft.slug)).rejects.toThrow();
    const review = await service.transition(author, writer, 'req', draft.id, { action: 'submit', expectedVersion: 1 }, key());
    expect(review.status).toBe('IN_REVIEW');
    await expect(service.transition(author, writer, 'req', draft.id, { action: 'publish', expectedVersion: 2 }, key())).rejects.toThrow(/cannot perform/u);
    const live = await service.transition(publisher, editor, 'req', draft.id, { action: 'publish', expectedVersion: 2 }, key());
    expect(live).toMatchObject({ status: 'PUBLISHED', reviewerId: publisher, selfReviewed: false });
    expect((await service.getPublic(draft.slug)).post).toMatchObject({ slug: draft.slug, readingMinutes: expect.any(Number) });
    expect((await service.listPublic(1)).items.some(item => item.slug === draft.slug)).toBe(true);
    expect((await service.revisions(draft.id)).map(r => r.version)).toEqual([3, 2, 1]);
  });

  it('flags a self-review, rejects thin articles and unsupported transitions', async () => {
    const self = await service.create(publisher, 'req', input('self'), key());
    expect((await service.transition(publisher, editor, 'req', self.id, { action: 'publish', expectedVersion: 1 }, key())).selfReviewed).toBe(true);
    const thin = await service.create(author, 'req', input('thin', { bodyHtml: '<p>کوتاه</p>' }), key());
    await expect(service.transition(publisher, editor, 'req', thin.id, { action: 'publish', expectedVersion: 1 }, key())).rejects.toThrow(/at least/u);
    await expect(service.transition(publisher, editor, 'req', thin.id, { action: 'unpublish', expectedVersion: 1 }, key())).rejects.toThrow(/cannot unpublish/u);
  });

  it('schedules publication in the future and only exposes it once due', async () => {
    const post = await service.create(author, 'req', input('later'), key());
    const at = new Date(Date.now() + 3_600_000).toISOString();
    await service.transition(publisher, editor, 'req', post.id, { action: 'publish', expectedVersion: 1, publishAt: at }, key());
    await expect(service.getPublic(post.slug)).rejects.toThrow();
    expect((await service.getPublic(post.slug, new Date(Date.now() + 7_200_000))).post?.slug).toBe(post.slug);
    expect((await service.sitemapRows()).some(row => row.slug === post.slug)).toBe(false);
  });

  it('keeps the old URL as a one-hop redirect after a rename and reserves slugs', async () => {
    const post = await service.create(author, 'req', input('old'), key());
    const live = await service.transition(publisher, editor, 'req', post.id, { action: 'publish', expectedVersion: 1 }, key());
    const renamed = await service.update(publisher, editor, 'req', post.id, live.version, input('new'), key());
    expect(renamed.slug).toBe(`blog-${run}-new`);
    expect(await service.getPublic(`blog-${run}-old`)).toEqual({ post: null, redirectSlug: `blog-${run}-new` });
    await expect(service.create(author, 'req', input('old'), key())).rejects.toThrow(/already used/u);
    const back = await service.update(publisher, editor, 'req', post.id, renamed.version, input('old'), key());
    expect((await service.getPublic(back.slug)).post?.slug).toBe(back.slug);
  });

  it('moves lastmod only for significant edits and requires publish permission to edit live content', async () => {
    const post = await service.create(author, 'req', input('lastmod'), key());
    const live = await service.transition(publisher, editor, 'req', post.id, { action: 'publish', expectedVersion: 1 }, key());
    await expect(service.update(author, writer, 'req', post.id, live.version, input('lastmod', { title: 'x' }), key())).rejects.toThrow(/publish permission/u);
    const same = await service.update(publisher, editor, 'req', post.id, live.version, input('lastmod', { title: live.title }), key());
    expect(same.contentUpdatedAt).toBe(live.contentUpdatedAt);
    const changed = await service.update(publisher, editor, 'req', post.id, same.version, input('lastmod', { title: 'عنوان تازه' }), key());
    expect(Date.parse(changed.contentUpdatedAt)).toBeGreaterThan(Date.parse(live.contentUpdatedAt));
  });

  it('is idempotent per key, rejects key reuse with other payloads and stale versions', async () => {
    const k = key();
    const first = await service.create(author, 'req', input('idem'), k);
    expect((await service.create(author, 'req', input('idem'), k)).id).toBe(first.id);
    await expect(service.create(author, 'req', input('idem-other'), k)).rejects.toThrow(/different/u);
    await expect(service.update(author, writer, 'req', first.id, 99, input('idem'), key())).rejects.toThrow(/reload/u);
    expect(await prisma.blogPost.count({ where: { slug: first.slug } })).toBe(1);
  });

  it('unpublish and archive remove the article from public reads and the sitemap source', async () => {
    const post = await service.create(author, 'req', input('gone'), key());
    const live = await service.transition(publisher, editor, 'req', post.id, { action: 'publish', expectedVersion: 1 }, key());
    const archived = await service.transition(publisher, editor, 'req', post.id, { action: 'archive', expectedVersion: live.version }, key());
    expect(archived.status).toBe('ARCHIVED');
    await expect(service.getPublic(post.slug)).rejects.toThrow();
    expect((await service.sitemapRows()).some(row => row.slug === post.slug)).toBe(false);
  });
});
