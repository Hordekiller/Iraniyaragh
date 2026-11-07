import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ProductReview, type ProductReviewStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  AdminReviewList, AdminReviewSummary, OwnReview, PublicReview, PublicReviewList, ReviewEligibility, ReviewInput, ReviewModerationRequest,
  ReviewReplyRequest, ReviewSort, ReviewSummary,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { publicAuthorName, REVIEW_PAGE_SIZE, validateNote, validateReply, validateReviewInput } from './reviews.validation';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type Tx = Prisma.TransactionClient;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 8000, maxWait: 3000 } as const;
const iso = (date: Date | null) => date?.toISOString() ?? null;
const fullName = (u: { firstName: string | null; lastName: string | null } | null) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || null : null);

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown review.' });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'The review changed; reload before saving.' });

/** Allowed moderation edges. A reviewer can always correct a decision except re-approving what is already live. */
export const MODERATION: Record<ReviewModerationRequest['action'], { from: ProductReviewStatus[]; to: ProductReviewStatus }> = {
  approve: { from: ['PENDING', 'REJECTED', 'HIDDEN'], to: 'APPROVED' },
  reject: { from: ['PENDING'], to: 'REJECTED' },
  hide: { from: ['APPROVED'], to: 'HIDDEN' },
};

type AdminRow = ProductReview & {
  product: { name: string; slug: string };
  customer: { firstName: string | null; lastName: string | null; mobile: string; userId: string | null };
  moderatedBy: { firstName: string | null; lastName: string | null } | null;
  staffRepliedBy: { firstName: string | null; lastName: string | null } | null;
};
const adminInclude = {
  product: { select: { name: true, slug: true } },
  customer: { select: { firstName: true, lastName: true, mobile: true, userId: true } },
  moderatedBy: { select: { firstName: true, lastName: true } },
  staffRepliedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ProductReviewInclude;

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  // ── Public ────────────────────────────────────────────────────────────────

  private async productIdBySlug(slug: string): Promise<string> {
    const product = await this.prisma.product.findFirst({ where: { slug, status: 'ACTIVE' }, select: { id: true } });
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown product.' });
    return product.id;
  }

  async summary(productId: string): Promise<ReviewSummary> {
    const groups = await this.prisma.productReview.groupBy({ by: ['rating'], where: { productId, status: 'APPROVED', product: { status: 'ACTIVE' } }, _count: { _all: true } });
    return summarize(groups.map(g => [g.rating, g._count._all]));
  }

  /** Aggregates for many products at once (listing cards, discovery); products without reviews are absent. */
  async summaries(productIds: string[]): Promise<Map<string, ReviewSummary>> {
    if (!productIds.length) return new Map();
    const groups = await this.prisma.productReview.groupBy({ by: ['productId', 'rating'], where: { productId: { in: productIds }, status: 'APPROVED', product: { status: 'ACTIVE' } }, _count: { _all: true } });
    const byProduct = new Map<string, Array<[number, number]>>();
    for (const g of groups) byProduct.set(g.productId, [...(byProduct.get(g.productId) ?? []), [g.rating, g._count._all]]);
    return new Map([...byProduct].map(([id, rows]) => [id, summarize(rows)]));
  }

  /** Card-level aggregates for a page of products; ids are opaque catalog ids, unknown ones are simply absent. */
  async summaryItems(productIds: string[]): Promise<Array<{ productId: string; average: number; count: number }>> {
    const map = await this.summaries(productIds);
    return [...map].filter(([, value]) => value.count > 0 && value.average !== null).map(([productId, value]) => ({ productId, average: value.average!, count: value.count }));
  }

  async listPublic(slug: string, page: number, sort: ReviewSort): Promise<PublicReviewList> {
    const productId = await this.productIdBySlug(slug);
    const where: Prisma.ProductReviewWhereInput = { productId, status: 'APPROVED' };
    const orderBy: Prisma.ProductReviewOrderByWithRelationInput[] = sort === 'highest' ? [{ rating: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }]
      : sort === 'lowest' ? [{ rating: 'asc' }, { publishedAt: 'desc' }, { id: 'desc' }] : [{ publishedAt: 'desc' }, { id: 'desc' }];
    const [summary, rows] = await Promise.all([
      this.summary(productId),
      this.prisma.productReview.findMany({ where, orderBy, skip: (page - 1) * REVIEW_PAGE_SIZE, take: REVIEW_PAGE_SIZE, include: { customer: { select: { firstName: true, lastName: true } } } }),
    ]);
    return { summary, items: rows.map(r => this.publicReview(r)), meta: { page, pages: Math.max(1, Math.ceil(summary.count / REVIEW_PAGE_SIZE)), total: summary.count, perPage: REVIEW_PAGE_SIZE } };
  }

  private publicReview(row: ProductReview & { customer: { firstName: string | null; lastName: string | null } }): PublicReview {
    return {
      id: row.id, rating: row.rating, title: row.title, body: row.body, authorName: publicAuthorName(row.customer.firstName, row.customer.lastName),
      verifiedPurchase: true, publishedAt: row.publishedAt!.toISOString(), staffReply: row.staffReply, staffRepliedAt: iso(row.staffRepliedAt),
    };
  }


  /** In-app notice written inside the command transaction; `dedupKey` makes a replay a no-op. Never carries review text. */
  private async notifyCustomer(tx: Tx, userId: string | null, kind: string, title: string, body: string, slug: string, dedupKey: string): Promise<void> {
    if (!userId) return;
    const href = `/products/${encodeURIComponent(slug)}#reviews`;
    await tx.inAppNotification.createMany({ data: [{ userId, audience: 'CUSTOMER', kind, title, body, href: href.length <= 200 ? href : null, dedupKey }], skipDuplicates: true });
  }

  private async notifyModerators(tx: Tx, reviewId: string, version: number, title: string, body: string): Promise<void> {
    const now = new Date();
    const users = await tx.user.findMany({
      where: {
        status: 'ACTIVE', deletedAt: null,
        roleAssignments: { some: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], role: { isActive: true, permissions: { some: { revokedAt: null, permission: { key: 'reviews.moderate', isActive: true } } } } } },
      },
      select: { id: true },
    });
    if (!users.length) return;
    await tx.inAppNotification.createMany({
      data: users.map(user => ({ userId: user.id, audience: 'STAFF' as const, kind: 'REVIEW_PENDING', title, body, href: '/reviews', dedupKey: `review:${reviewId}:${version}:staff` })),
      skipDuplicates: true,
    });
  }

  // ── Customer ──────────────────────────────────────────────────────────────

  private async activeCustomer(userId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (!customer || customer.status !== 'ACTIVE') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'An active customer account is required.' });
    return customer.id;
  }

  /** Most recent DELIVERED order of this customer that contains the product; the proof of purchase. */
  private async deliveredOrderId(db: Pick<Tx, 'order'>, customerId: string, productId: string): Promise<string | null> {
    const order = await db.order.findFirst({
      where: { customerId, fulfillment: { is: { status: 'DELIVERED' } }, items: { some: { variant: { productId } } } },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    return order?.id ?? null;
  }

  private own(row: ProductReview): OwnReview {
    return { id: row.id, rating: row.rating, title: row.title, body: row.body, status: row.status, version: row.version, moderationNote: row.status === 'PENDING' || row.status === 'APPROVED' ? null : row.moderationNote, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async eligibility(userId: string, slug: string): Promise<ReviewEligibility> {
    const productId = await this.productIdBySlug(slug);
    const customerId = await this.activeCustomer(userId);
    const existing = await this.prisma.productReview.findUnique({ where: { productId_customerId: { productId, customerId } } });
    if (existing) return { canReview: false, reason: 'ALREADY_REVIEWED', review: this.own(existing) };
    const purchased = await this.deliveredOrderId(this.prisma, customerId, productId);
    return purchased ? { canReview: true, reason: 'ELIGIBLE', review: null } : { canReview: false, reason: 'NOT_PURCHASED', review: null };
  }

  /** Runs `work` once per (actor, key); a replay with the same payload returns the stored response. */
  private async command<T>(actorId: string, key: string, payload: unknown, work: (tx: Tx) => Promise<T>): Promise<T> {
    const keyHash = digest(key);
    const payloadHash = digest(JSON.stringify(payload));
    try {
      return await this.prisma.$transaction(async tx => {
        const replay = await tx.productReviewCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
        if (replay) {
          if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to a different review change.' });
          return replay.response as unknown as T;
        }
        const result = await work(tx);
        await tx.productReviewCommand.create({ data: { actorId, keyHash, payloadHash, response: result as unknown as Prisma.InputJsonObject } });
        return result;
      }, SERIALIZABLE);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') throw new ConflictException({ code: 'CONCURRENT_UPDATE', message: 'The review changed at the same time; retry.' });
        if (error.code === 'P2002') {
          const target = JSON.stringify(error.meta?.target ?? '');
          if (target.includes('keyHash')) {
            // Same actor and key raced: an identical payload is a safe replay, a different one is a conflict.
            const winner = await this.prisma.productReviewCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } } });
            if (winner && winner.payloadHash === payloadHash) return winner.response as unknown as T;
            if (winner) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to a different review change.' });
            throw new ConflictException({ code: 'CONCURRENT_UPDATE', message: 'The review changed at the same time; retry.' });
          }
          if (target.includes('productId') && target.includes('customerId')) throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'You have already reviewed this product.' });
        }
      }
      throw error;
    }
  }

  async create(userId: string, requestId: string, slug: string, raw: ReviewInput, key: string): Promise<OwnReview> {
    const input = validateReviewInput(raw);
    const customerId = await this.activeCustomer(userId);
    return this.command(userId, key, { op: 'create', slug, input }, async tx => {
      const product = await tx.product.findFirst({ where: { slug, status: 'ACTIVE' }, select: { id: true } });
      if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown product.' });
      if (await tx.productReview.findUnique({ where: { productId_customerId: { productId: product.id, customerId } }, select: { id: true } })) {
        throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'You have already reviewed this product.' });
      }
      const orderId = await this.deliveredOrderId(tx, customerId, product.id);
      if (!orderId) throw new ForbiddenException({ code: 'REVIEW_NOT_ELIGIBLE', message: 'Only customers with a delivered order of this product can review it.' });
      const row = await tx.productReview.create({ data: { productId: product.id, customerId, orderId, ...input } });
      await this.notifyModerators(tx, row.id, row.version, 'نظر جدید منتظر بررسی', 'یک نظر مشتری برای بررسی و انتشار ثبت شد');
      await this.audit.record({ actorId: userId, requestId, action: 'review.created', entityType: 'product_review', entityId: row.id, after: { productId: product.id, rating: row.rating, status: row.status } }, tx);
      return this.own(row);
    });
  }

  /** Editing returns the review to moderation and drops the reply that answered the old text. */
  async updateOwn(userId: string, requestId: string, reviewId: string, expectedVersion: number, raw: ReviewInput, key: string): Promise<OwnReview> {
    const input = validateReviewInput(raw);
    const customerId = await this.activeCustomer(userId);
    return this.command(userId, key, { op: 'update', reviewId, expectedVersion, input }, async tx => {
      const current = await tx.productReview.findFirst({ where: { id: reviewId, customerId } });
      if (!current) throw notFound();
      if (current.version !== expectedVersion) throw stale();
      if (current.status === 'HIDDEN') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'A hidden review can only be restored by the store team.' });
      const row = await tx.productReview.update({
        where: { id: reviewId },
        data: { ...input, status: 'PENDING', version: { increment: 1 }, staffReply: null, staffRepliedAt: null, staffRepliedById: null, moderationNote: null, moderatedAt: null, moderatedById: null },
      });
      await this.notifyModerators(tx, row.id, row.version, 'نظر ویرایش‌شده منتظر بررسی', 'مشتری نظر خود را ویرایش کرد و دوباره منتظر بررسی است');
      await this.audit.record({ actorId: userId, requestId, action: 'review.edited', entityType: 'product_review', entityId: row.id, before: { status: current.status, rating: current.rating, version: current.version }, after: { status: row.status, rating: row.rating, version: row.version } }, tx);
      return this.own(row);
    });
  }

  // ── Staff ─────────────────────────────────────────────────────────────────

  private admin(row: AdminRow): AdminReviewSummary {
    return {
      id: row.id, productId: row.productId, productName: row.product.name, productSlug: row.product.slug,
      customerName: fullName(row.customer) ?? row.customer.mobile, rating: row.rating, title: row.title, body: row.body, status: row.status, version: row.version,
      moderationNote: row.moderationNote, moderatedByName: fullName(row.moderatedBy), moderatedAt: iso(row.moderatedAt),
      staffReply: row.staffReply, staffRepliedByName: fullName(row.staffRepliedBy), staffRepliedAt: iso(row.staffRepliedAt),
      orderId: row.orderId, publishedAt: iso(row.publishedAt), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listAdmin(query: { page: number; status?: ProductReviewStatus; q?: string; productId?: string; rating?: number }): Promise<AdminReviewList> {
    const where: Prisma.ProductReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}), ...(query.productId ? { productId: query.productId } : {}), ...(query.rating ? { rating: query.rating } : {}),
      ...(query.q ? { OR: [{ body: { contains: query.q, mode: 'insensitive' } }, { title: { contains: query.q, mode: 'insensitive' } }, { product: { name: { contains: query.q, mode: 'insensitive' } } }] } : {}),
    };
    const [total, pending, rows] = await Promise.all([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.count({ where: { status: 'PENDING' } }),
      this.prisma.productReview.findMany({ where, include: adminInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * REVIEW_PAGE_SIZE, take: REVIEW_PAGE_SIZE }),
    ]);
    return { items: rows.map(r => this.admin(r)), pending, meta: { page: query.page, pages: Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE)), total, perPage: REVIEW_PAGE_SIZE } };
  }

  async getAdmin(id: string): Promise<AdminReviewSummary> {
    const row = await this.prisma.productReview.findUnique({ where: { id }, include: adminInclude });
    if (!row) throw notFound();
    return this.admin(row);
  }

  async moderate(actorId: string, requestId: string, id: string, request: ReviewModerationRequest, key: string): Promise<AdminReviewSummary> {
    const edge = MODERATION[request.action];
    if (!edge) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Unknown moderation action.' });
    const note = validateNote(request.note, request.action !== 'approve');
    return this.command(actorId, key, { op: 'moderate', id, request: { ...request, note } }, async tx => {
      const current = await tx.productReview.findUnique({ where: { id } });
      if (!current) throw notFound();
      if (current.version !== request.expectedVersion) throw stale();
      if (!edge.from.includes(current.status)) throw new ConflictException({ code: 'INVALID_TRANSITION', message: `A ${current.status} review cannot be ${request.action}d.` });
      const now = new Date();
      const row = await tx.productReview.update({
        where: { id },
        data: {
          status: edge.to, version: { increment: 1 }, moderationNote: note, moderatedById: actorId, moderatedAt: now,
          ...(edge.to === 'APPROVED' ? { publishedAt: current.publishedAt ?? now } : {}),
          // A reply to a review that is no longer public must not linger.
          ...(edge.to !== 'APPROVED' ? { staffReply: null, staffRepliedAt: null, staffRepliedById: null } : {}),
        },
        include: adminInclude,
      });
      const copy = {
        approve: ['REVIEW_APPROVED', 'نظر شما منتشر شد', 'نظر شما برای این کالا تأیید و در سایت منتشر شد'],
        reject: ['REVIEW_REJECTED', 'نظر شما منتشر نشد', note ? `نظر شما منتشر نشد: ${note}` : 'نظر شما منتشر نشد'],
        hide: ['REVIEW_HIDDEN', 'نظر شما از نمایش خارج شد', note ? `نظر شما از نمایش خارج شد: ${note}` : 'نظر شما از نمایش خارج شد'],
      }[request.action] as [string, string, string];
      await this.notifyCustomer(tx, row.customer.userId, copy[0], copy[1], copy[2].slice(0, 400), row.product.slug, `review:${id}:${row.version}:customer`);
      await this.audit.record({ actorId, requestId, action: `review.${request.action}`, entityType: 'product_review', entityId: id, before: { status: current.status, version: current.version }, after: { status: row.status, version: row.version }, metadata: { note } }, tx);
      return this.admin(row);
    });
  }

  async reply(actorId: string, requestId: string, id: string, request: ReviewReplyRequest, key: string): Promise<AdminReviewSummary> {
    const reply = validateReply(request.reply);
    return this.command(actorId, key, { op: 'reply', id, expectedVersion: request.expectedVersion, reply }, async tx => {
      const current = await tx.productReview.findUnique({ where: { id } });
      if (!current) throw notFound();
      if (current.version !== request.expectedVersion) throw stale();
      if (current.status !== 'APPROVED') throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Only a published review can receive a reply.' });
      const now = new Date();
      const row = await tx.productReview.update({
        where: { id },
        data: reply ? { staffReply: reply, staffRepliedById: actorId, staffRepliedAt: now, version: { increment: 1 } } : { staffReply: null, staffRepliedById: null, staffRepliedAt: null, version: { increment: 1 } },
        include: adminInclude,
      });
      if (reply) await this.notifyCustomer(tx, row.customer.userId, 'REVIEW_REPLIED', 'فروشگاه به نظر شما پاسخ داد', 'پاسخ فروشگاه به نظر شما برای این کالا ثبت شد', row.product.slug, `review:${id}:${row.version}:customer`);
      await this.audit.record({ actorId, requestId, action: reply ? 'review.replied' : 'review.reply_removed', entityType: 'product_review', entityId: id, before: { version: current.version, hadReply: Boolean(current.staffReply) }, after: { version: row.version } }, tx);
      return this.admin(row);
    });
  }
}

export function summarize(rows: Array<[number, number]>): ReviewSummary {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const [rating, n] of rows) if (rating >= 1 && rating <= 5) counts[rating - 1] += n;
  const count = counts.reduce((a, b) => a + b, 0);
  const average = count ? Math.round((counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / count) * 10) / 10 : null;
  return { count, average, counts };
}
