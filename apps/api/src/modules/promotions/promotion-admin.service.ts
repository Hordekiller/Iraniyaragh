import { createHash, randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CouponAdmin,
  CouponGenerateRequest,
  PromotionAdmin,
  PromotionInput,
  PromotionRedemptionRow,
  PromotionReportRow,
  PromotionStats,
  PublicPromotion,
} from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';
import { COUPON_CODE_PATTERN, lineEligible, normalizeCouponCode } from './promotion-engine';
import { promotionsService } from './promotions.service';
import { promotionState, validatePromotionInput, type ValidPromotion } from './promotion-validation';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const money = (v: bigint) => ({ amount: v.toString(), currency: 'IRR' as const });
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type Row = Prisma.PromotionGetPayload<{ include: { targets: true; _count: { select: { coupons: true } } } }>;
const include = { targets: true, _count: { select: { coupons: true } } } as const;

function couponView(c: Prisma.CouponGetPayload<object>): CouponAdmin {
  return {
    id: c.id, promotionId: c.promotionId, code: c.code, isActive: c.isActive,
    maxRedemptions: c.maxRedemptions, usedCount: c.usedCount, customerId: c.customerId, createdAt: c.createdAt.toISOString(),
  };
}

const PUBLIC_CACHE_MS = 15_000;
const PUBLIC_SCOPE_LIMIT = 500;
let publicCache: { at: number; value: PublicPromotion[] } | null = null;
/** Test hook: campaign changes are visible to the public projection immediately. */
export function resetPublicCampaignCache(): void { publicCache = null; }

@Injectable()
export class PromotionAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async list(query: { q?: string; state?: string; mode?: string; offset: number; limit: number }) {
    const now = new Date();
    const where: Prisma.PromotionWhereInput = {};
    if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { coupons: { some: { code: { contains: normalizeCouponCode(query.q) } } } }];
    if (query.mode === 'COUPON' || query.mode === 'AUTOMATIC') where.mode = query.mode;
    const and: Prisma.PromotionWhereInput[] = [];
    if (query.state === 'INACTIVE') and.push({ isActive: false });
    if (query.state === 'EXPIRED') and.push({ isActive: true, endsAt: { lte: now } });
    if (query.state === 'SCHEDULED') and.push({ isActive: true, startsAt: { gt: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] });
    if (query.state === 'ACTIVE') and.push({ isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] });
    if (and.length) where.AND = and;
    const [rows, total] = await Promise.all([
      this.prisma.promotion.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: query.offset, take: query.limit }),
      this.prisma.promotion.count({ where }),
    ]);
    const stats = await this.statsFor(rows.map((r) => r.id));
    return { items: rows.map((r) => this.view(r, stats.get(r.id), now)), total };
  }

  async get(id: string): Promise<PromotionAdmin> {
    const row = await this.prisma.promotion.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Promotion not found.' });
    const stats = await this.statsFor([id]);
    return this.view(row, stats.get(id), new Date());
  }

  async report(): Promise<PromotionReportRow[]> {
    const rows = await this.prisma.promotion.findMany({ include, orderBy: [{ createdAt: 'desc' }], take: 500 });
    const stats = await this.statsFor(rows.map((r) => r.id));
    const now = new Date();
    return rows.map((r) => ({ promotionId: r.id, name: r.name, state: promotionState(r, now), stats: stats.get(r.id) ?? emptyStats() }));
  }

  /**
   * Public, display-only campaign projection. Scope is resolved here against the live catalog with the same
   * eligibility rule the pricing engine uses, so a badge never claims more than checkout would honour.
   * Customer-specific, coupon and first-purchase campaigns are never exposed. Cached briefly because this is
   * an unauthenticated read; pricing and checkout always re-evaluate from the database.
   */
  async publicCampaigns(): Promise<PublicPromotion[]> {
    const nowMs = Date.now();
    if (publicCache && nowMs - publicCache.at < PUBLIC_CACHE_MS) return publicCache.value;
    const now = new Date(nowMs);
    const horizon = new Date(now.getTime() + 14 * 24 * 3_600_000);
    const rows = (await this.prisma.promotion.findMany({
      where: {
        isActive: true, mode: 'AUTOMATIC', customerId: null, firstPurchaseOnly: false,
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: [{ startsAt: null }, { startsAt: { lte: horizon } }] }],
      },
      include: { targets: true }, orderBy: [{ priority: 'asc' }, { id: 'asc' }], take: 50,
    })).filter((r) => r.maxRedemptions === null || r.usedCount < r.maxRedemptions);
    const value: PublicPromotion[] = [];
    if (rows.length > 0) {
      const sellable = { isActive: true, status: 'ACTIVE' as const };
      const [products, ancestry] = await Promise.all([
        this.prisma.product.findMany({
          where: { status: 'ACTIVE', variants: { some: sellable } },
          select: { id: true, brandId: true, categoryId: true, variants: { where: sellable, select: { id: true } } },
        }),
        promotionsService.categoryAncestry(this.prisma),
      ]);
      for (const r of rows) {
        const targets = r.targets.map((t) => ({ type: t.type, targetId: t.targetId, exclude: t.exclude }));
        const passing = (p: (typeof products)[number]) => p.variants.every((v) => lineEligible({
          variantId: v.id, productId: p.id, categoryIds: p.categoryId ? (ancestry.get(p.categoryId) ?? [p.categoryId]) : [],
          brandId: p.brandId, unitPrice: 0n, quantity: 1,
        }, targets));
        const storeWide = !targets.some((t) => !t.exclude);
        const scope: PublicPromotion['scope'] = storeWide
          ? { all: true, exceptProductIds: products.filter((p) => !passing(p)).map((p) => p.id) }
          : { all: false, productIds: products.filter(passing).map((p) => p.id) };
        const size = scope.all ? scope.exceptProductIds.length : scope.productIds.length;
        // Nothing to show, or too large to ship to every visitor: omit rather than guess.
        if (size > PUBLIC_SCOPE_LIMIT || (!scope.all && size === 0)) continue;
        value.push({
          id: r.id, name: r.name, badgeText: r.badgeText, kind: r.kind, percentBp: r.percentBp, amount: r.amount?.toString() ?? null,
          startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
          scheduled: !!r.startsAt && r.startsAt > now, scope,
        });
      }
    }
    publicCache = { at: nowMs, value };
    return value;
  }

  async create(actorId: string, requestId: string, input: PromotionInput, key: string): Promise<PromotionAdmin> {
    const valid = validatePromotionInput(input);
    return this.command(actorId, 'create', key, JSON.stringify(input), async (tx) => {
      await this.assertReferences(tx, valid);
      const row = await tx.promotion.create({
        data: this.data(valid, actorId), include,
      });
      await this.audit.record({ action: 'promotion.created', entityType: 'promotion', entityId: row.id, after: this.snapshot(row), actorId, requestId }, tx);
      return this.view(row, undefined, new Date());
    });
  }

  async update(actorId: string, requestId: string, id: string, input: PromotionInput, expectedVersion: number, key: string): Promise<PromotionAdmin> {
    const valid = validatePromotionInput(input);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'expectedVersion is required.' });
    return this.command(actorId, `update:${id}`, key, JSON.stringify([input, expectedVersion]), async (tx) => {
      const current = await this.lock(tx, id);
      if (current.version !== expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Reload the promotion before editing.' });
      if (current.mode !== valid.mode) throw new ConflictException({ code: 'PROMOTION_MODE_IMMUTABLE', message: 'Mode cannot change after creation.' });
      if (valid.maxRedemptions !== null && valid.maxRedemptions < current.usedCount) {
        throw new ConflictException({ code: 'LIMIT_BELOW_USAGE', message: 'Redemption limit cannot be below current usage.' });
      }
      await this.assertReferences(tx, valid);
      await tx.promotionTarget.deleteMany({ where: { promotionId: id } });
      const row = await tx.promotion.update({
        where: { id }, data: { ...this.data(valid, null), createdById: undefined, version: { increment: 1 } }, include,
      });
      await this.audit.record({ action: 'promotion.updated', entityType: 'promotion', entityId: id, before: this.snapshot(current), after: this.snapshot(row), actorId, requestId }, tx);
      return this.view(row, undefined, new Date());
    });
  }

  async setActive(actorId: string, requestId: string, id: string, isActive: boolean, expectedVersion: number, key: string): Promise<PromotionAdmin> {
    if (typeof isActive !== 'boolean' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'isActive and expectedVersion are required.' });
    return this.command(actorId, `active:${id}`, key, JSON.stringify([isActive, expectedVersion]), async (tx) => {
      const current = await this.lock(tx, id);
      if (current.version !== expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Reload the promotion before editing.' });
      const row = await tx.promotion.update({ where: { id }, data: { isActive, version: { increment: 1 } }, include });
      await this.audit.record({ action: isActive ? 'promotion.activated' : 'promotion.deactivated', entityType: 'promotion', entityId: id, before: { isActive: current.isActive }, after: { isActive }, actorId, requestId }, tx);
      return this.view(row, undefined, new Date());
    });
  }

  async listCoupons(promotionId: string, offset: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.coupon.findMany({ where: { promotionId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: offset, take: limit }),
      this.prisma.coupon.count({ where: { promotionId } }),
    ]);
    return { items: items.map(couponView), total };
  }

  async generateCoupons(actorId: string, requestId: string, promotionId: string, input: CouponGenerateRequest, key: string): Promise<CouponAdmin[]> {
    const explicit = input.code === undefined ? null : normalizeCouponCode(String(input.code));
    if (explicit !== null && !COUPON_CODE_PATTERN.test(explicit)) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Coupon code must be 4–40 letters or digits.' });
    const count = explicit ? 1 : input.count;
    if (!count || !Number.isSafeInteger(count) || count < 1 || count > 500) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'count must be 1–500.' });
    if (input.maxRedemptions !== null && (!Number.isSafeInteger(input.maxRedemptions) || input.maxRedemptions < 1)) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'maxRedemptions is invalid.' });
    return this.command(actorId, `coupons:${promotionId}`, key, JSON.stringify(input), async (tx) => {
      const promo = await this.lock(tx, promotionId);
      if (promo.mode !== 'COUPON') throw new ConflictException({ code: 'PROMOTION_NOT_COUPON', message: 'Only coupon promotions accept codes.' });
      if (input.customerId && !(await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Customer not found.' });
      const created: CouponAdmin[] = [];
      for (let i = 0; i < count; i += 1) {
        const code = explicit ?? Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
        if (await tx.coupon.findUnique({ where: { code }, select: { id: true } })) {
          if (explicit) throw new ConflictException({ code: 'COUPON_CODE_TAKEN', message: 'This coupon code already exists.' });
          i -= 1;
          continue;
        }
        created.push(couponView(await tx.coupon.create({ data: { promotionId, code, maxRedemptions: input.maxRedemptions, customerId: input.customerId } })));
      }
      await this.audit.record({ action: 'promotion.coupons.generated', entityType: 'promotion', entityId: promotionId, metadata: { count, explicit: !!explicit }, actorId, requestId }, tx);
      return created;
    });
  }

  async setCouponActive(actorId: string, requestId: string, couponId: string, isActive: boolean, key: string): Promise<CouponAdmin> {
    if (typeof isActive !== 'boolean') throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'isActive is required.' });
    return this.command(actorId, `coupon:${couponId}`, key, JSON.stringify(isActive), async (tx) => {
      const before = await tx.coupon.findUnique({ where: { id: couponId } });
      if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Coupon not found.' });
      const row = await tx.coupon.update({ where: { id: couponId }, data: { isActive } });
      await this.audit.record({ action: isActive ? 'coupon.activated' : 'coupon.deactivated', entityType: 'coupon', entityId: couponId, before: { isActive: before.isActive }, after: { isActive }, actorId, requestId }, tx);
      return couponView(row);
    });
  }

  async redemptions(query: { promotionId?: string; customerId?: string; status?: string; offset: number; limit: number }) {
    const where: Prisma.PromotionRedemptionWhereInput = {};
    if (query.promotionId) where.promotionId = query.promotionId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.status && ['RESERVED', 'CONFIRMED', 'RELEASED', 'REFUNDED'].includes(query.status)) where.status = query.status as never;
    const [rows, total] = await Promise.all([
      this.prisma.promotionRedemption.findMany({
        where, orderBy: [{ reservedAt: 'desc' }, { id: 'asc' }], skip: query.offset, take: query.limit,
        include: { promotion: { select: { name: true } }, coupon: { select: { code: true } }, order: { select: { number: true, grandTotal: true } } },
      }),
      this.prisma.promotionRedemption.count({ where }),
    ]);
    const items: PromotionRedemptionRow[] = rows.map((r) => ({
      id: r.id, promotionId: r.promotionId, promotionName: r.promotion.name, couponCode: r.coupon?.code ?? null,
      orderId: r.orderId, orderNumber: r.order.number, customerId: r.customerId, status: r.status,
      discount: money(r.discountAmount), shippingDiscount: money(r.shippingDiscount), refundedDiscount: money(r.refundedDiscount),
      orderTotal: money(r.order.grandTotal), reservedAt: r.reservedAt.toISOString(),
      confirmedAt: r.confirmedAt?.toISOString() ?? null, releasedAt: r.releasedAt?.toISOString() ?? null, releaseReason: r.releaseReason,
    }));
    return { items, total };
  }

  // -- internals -----------------------------------------------------------

  private async statsFor(ids: string[]): Promise<Map<string, PromotionStats>> {
    const out = new Map<string, PromotionStats>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.$queryRaw<{ promotionId: string; status: string; n: bigint; discount: bigint; refunded: bigint; sales: bigint }[]>`
      SELECT r."promotionId", r."status"::text AS status, COUNT(*)::bigint AS n,
             COALESCE(SUM(r."discountAmount"), 0)::bigint AS discount,
             COALESCE(SUM(r."refundedDiscount"), 0)::bigint AS refunded,
             COALESCE(SUM(o."grandTotal"), 0)::bigint AS sales
      FROM "PromotionRedemption" r JOIN "Order" o ON o."id" = r."orderId"
      WHERE r."promotionId" IN (${Prisma.join(ids)})
      GROUP BY r."promotionId", r."status"`;
    for (const r of rows) {
      const s = out.get(r.promotionId) ?? emptyStats();
      const n = Number(r.n);
      if (r.status === 'RESERVED') s.reserved = n;
      if (r.status === 'CONFIRMED') {
        s.confirmed = n;
        s.discountConfirmed = money(r.discount);
        s.salesAttributed = money(r.sales);
        s.discountRefunded = money(BigInt(s.discountRefunded.amount) + r.refunded);
      }
      if (r.status === 'RELEASED') s.released = n;
      if (r.status === 'REFUNDED') {
        s.refunded = n;
        s.discountRefunded = money(BigInt(s.discountRefunded.amount) + r.refunded);
      }
      out.set(r.promotionId, s);
    }
    return out;
  }

  private view(row: Row, stats: PromotionStats | undefined, now: Date): PromotionAdmin {
    return {
      id: row.id, name: row.name, description: row.description, badgeText: row.badgeText, kind: row.kind, mode: row.mode,
      percentBp: row.percentBp, amount: row.amount?.toString() ?? null, maxDiscount: row.maxDiscount?.toString() ?? null,
      minOrder: row.minOrder?.toString() ?? null, maxOrder: row.maxOrder?.toString() ?? null,
      startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null,
      maxRedemptions: row.maxRedemptions, perCustomerLimit: row.perCustomerLimit, firstPurchaseOnly: row.firstPurchaseOnly,
      customerId: row.customerId, stackable: row.stackable, priority: row.priority,
      targets: row.targets.map((t) => ({ type: t.type, targetId: t.targetId, exclude: t.exclude })),
      isActive: row.isActive, state: promotionState(row, now), usedCount: row.usedCount, couponCount: row._count.coupons,
      version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      stats: stats ?? emptyStats(),
    };
  }

  private data(v: ValidPromotion, createdById: string | null) {
    const { targets, ...rest } = v;
    return { ...rest, ...(createdById ? { createdById } : {}), targets: { create: targets } };
  }

  private snapshot(row: Row | Prisma.PromotionGetPayload<object>): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonObject;
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    const [hi, lo] = advisoryLockIdKey('promotion', id);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
    const row = await tx.promotion.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Promotion not found.' });
    return row;
  }

  private async assertReferences(tx: Prisma.TransactionClient, v: ValidPromotion) {
    if (v.customerId && !(await tx.customer.findUnique({ where: { id: v.customerId }, select: { id: true } }))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Customer not found.' });
    }
    const by = (type: string) => [...new Set(v.targets.filter((t) => t.type === type).map((t) => t.targetId))];
    const checks: [string, string[], Promise<number>][] = [
      ['PRODUCT', by('PRODUCT'), tx.product.count({ where: { id: { in: by('PRODUCT') } } })],
      ['VARIANT', by('VARIANT'), tx.productVariant.count({ where: { id: { in: by('VARIANT') } } })],
      ['CATEGORY', by('CATEGORY'), tx.category.count({ where: { id: { in: by('CATEGORY') } } })],
      ['BRAND', by('BRAND'), tx.brand.count({ where: { id: { in: by('BRAND') } } })],
    ];
    for (const [type, ids, found] of checks) {
      if ((await found) !== ids.length) throw new BadRequestException({ code: 'INVALID_REQUEST', message: `Unknown ${type.toLowerCase()} target.` });
    }
  }

  private command<T>(actorId: string, scope: string, key: string, payload: string, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const keyHash = hash(key);
    const payloadHash = hash(payload);
    const scopeKey = scope.slice(0, 64);
    return withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'Promotion changed concurrently; reload before retrying.',
      operation: () => this.prisma.$transaction(async (tx) => {
        const prior = await tx.promotionCommand.findUnique({ where: { actorId_scope_keyHash: { actorId, scope: scopeKey, keyHash } } });
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Retry key payload changed.' });
          return prior.response as unknown as T;
        }
        const response = await run(tx);
        await tx.promotionCommand.create({ data: { actorId, scope: scopeKey, keyHash, payloadHash, response: response as unknown as Prisma.InputJsonValue } });
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    }).finally(resetPublicCampaignCache);
  }
}

function emptyStats(): PromotionStats {
  return { reserved: 0, confirmed: 0, released: 0, refunded: 0, discountConfirmed: money(0n), discountRefunded: money(0n), salesAttributed: money(0n) };
}
