import { ConflictException } from '@nestjs/common';
import type { CartPromotionView, CouponErrorCode } from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import {
  evaluatePromotions,
  normalizeCouponCode,
  type EngineLine,
  type EnginePromotion,
  type EngineResult,
} from './promotion-engine';

type Db = PrismaService | Prisma.TransactionClient;

export type PricingLine = {
  variantId: string;
  productId: string;
  categoryId: string | null;
  brandId: string | null;
  unitPrice: bigint;
  quantity: number;
};

export type PricingOutcome = {
  result: EngineResult;
  couponCode: string | null;
  couponError: { code: CouponErrorCode; message: string } | null;
  subtotal: bigint;
};

const COUPON_MESSAGES: Record<CouponErrorCode, string> = {
  COUPON_NOT_FOUND: 'کد تخفیف معتبر نیست.',
  COUPON_INACTIVE: 'این کد تخفیف غیرفعال است.',
  COUPON_NOT_STARTED: 'زمان استفاده از این کد تخفیف هنوز شروع نشده است.',
  COUPON_EXPIRED: 'مهلت استفاده از این کد تخفیف به پایان رسیده است.',
  COUPON_EXHAUSTED: 'ظرفیت استفاده از این کد تخفیف تکمیل شده است.',
  COUPON_CUSTOMER_LIMIT: 'سقف دفعات استفاده شما از این کد تخفیف تکمیل شده است.',
  COUPON_NOT_ELIGIBLE: 'این کد تخفیف برای حساب شما قابل استفاده نیست.',
  COUPON_NOT_APPLICABLE: 'این کد تخفیف برای سبد خرید فعلی شما قابل اعمال نیست.',
};

export class CouponRejection extends Error {
  constructor(readonly code: CouponErrorCode) {
    super(COUPON_MESSAGES[code]);
  }
}
export const couponMessage = (code: CouponErrorCode) => COUPON_MESSAGES[code];

const promotionInclude = { targets: true } satisfies Prisma.PromotionInclude;
type PromotionRow = Prisma.PromotionGetPayload<{ include: typeof promotionInclude }>;

const toEngine = (p: PromotionRow, couponId: string | null): EnginePromotion => ({
  id: p.id,
  couponId,
  name: p.name,
  kind: p.kind,
  percentBp: p.percentBp,
  amount: p.amount,
  maxDiscount: p.maxDiscount,
  minOrder: p.minOrder,
  maxOrder: p.maxOrder,
  stackable: p.stackable,
  priority: p.priority,
  targets: p.targets.map((t) => ({ type: t.type, targetId: t.targetId, exclude: t.exclude })),
});

/** Stateless: every method receives the client/transaction it must use. */
export class PromotionsService {
  /** Price a set of lines. Pure read; safe for cart, preview and checkout. */
  async price(
    db: Db,
    input: {
      customerId: string;
      lines: PricingLine[];
      shipping: bigint;
      couponCode: string | null;
      now: Date;
      /** False in the cart, where the shipping method (and its discount) is not chosen yet. */
      shippingKnown?: boolean;
      /** Order being (re)priced; excluded from first-purchase / usage checks. */
      excludeOrderId?: string;
    },
  ): Promise<PricingOutcome> {
    const subtotal = input.lines.reduce((s, l) => s + l.unitPrice * BigInt(l.quantity), 0n);
    const empty: EngineResult = { applied: [], itemDiscount: 0n, shippingDiscount: 0n, totalDiscount: 0n };
    if (input.lines.length === 0) return { result: empty, couponCode: null, couponError: null, subtotal };

    const ancestry = await this.categoryAncestry(db);
    const lines: EngineLine[] = input.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      categoryIds: l.categoryId ? (ancestry.get(l.categoryId) ?? [l.categoryId]) : [],
      brandId: l.brandId,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
    }));

    const window = {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
      ],
    } satisfies Prisma.PromotionWhereInput;
    const autos = await db.promotion.findMany({
      where: { ...window, mode: 'AUTOMATIC', OR: [{ customerId: null }, { customerId: input.customerId }] },
      include: promotionInclude,
    });

    const candidates: EnginePromotion[] = [];
    for (const p of autos) {
      if (await this.usable(db, p, input.customerId, input.excludeOrderId)) candidates.push(toEngine(p, null));
    }

    let couponCode: string | null = null;
    let couponError: PricingOutcome['couponError'] = null;
    if (input.couponCode) {
      const code = normalizeCouponCode(input.couponCode);
      couponCode = code;
      try {
        const coupon = await db.coupon.findUnique({
          where: { code },
          include: { promotion: { include: promotionInclude } },
        });
        if (!coupon || coupon.promotion.mode !== 'COUPON') throw new CouponRejection('COUPON_NOT_FOUND');
        const p = coupon.promotion;
        if (!coupon.isActive || !p.isActive) throw new CouponRejection('COUPON_INACTIVE');
        if (p.startsAt && p.startsAt > input.now) throw new CouponRejection('COUPON_NOT_STARTED');
        if (p.endsAt && p.endsAt <= input.now) throw new CouponRejection('COUPON_EXPIRED');
        if (
          (coupon.customerId && coupon.customerId !== input.customerId) ||
          (p.customerId && p.customerId !== input.customerId)
        ) {
          throw new CouponRejection('COUPON_NOT_ELIGIBLE');
        }
        if (
          (coupon.maxRedemptions !== null && coupon.usedCount >= coupon.maxRedemptions) ||
          (p.maxRedemptions !== null && p.usedCount >= p.maxRedemptions)
        ) {
          throw new CouponRejection('COUPON_EXHAUSTED');
        }
        if (p.perCustomerLimit !== null) {
          const used = await this.customerUsage(db, p.id, input.customerId, input.excludeOrderId);
          if (used >= p.perCustomerLimit) throw new CouponRejection('COUPON_CUSTOMER_LIMIT');
        }
        if (p.firstPurchaseOnly && !(await this.isFirstPurchase(db, input.customerId, input.excludeOrderId))) {
          throw new CouponRejection('COUPON_NOT_ELIGIBLE');
        }
        const probe = evaluatePromotions({ lines, shipping: input.shipping, candidates: [toEngine(p, coupon.id)] });
        const deferred = input.shippingKnown === false && p.kind === 'FREE_SHIPPING';
        if (probe.totalDiscount === 0n && !deferred) throw new CouponRejection('COUPON_NOT_APPLICABLE');
        candidates.push(toEngine(p, coupon.id));
      } catch (error) {
        if (!(error instanceof CouponRejection)) throw error;
        couponError = { code: error.code, message: error.message };
      }
    }

    const result = evaluatePromotions({ lines, shipping: input.shipping, candidates });
    // A valid coupon that loses to a better exclusive promotion is not applied.
    const deferredCoupon = input.shippingKnown === false && result.applied.length === 0 && candidates.some((c) => c.couponId && c.kind === 'FREE_SHIPPING');
    if (couponCode && !couponError && !deferredCoupon && !result.applied.some((a) => a.couponId)) {
      couponError = { code: 'COUPON_NOT_APPLICABLE', message: COUPON_MESSAGES.COUPON_NOT_APPLICABLE };
    }
    return { result, couponCode, couponError, subtotal };
  }

  cartView(outcome: PricingOutcome): CartPromotionView {
    const money = (v: bigint) => ({ amount: v.toString(), currency: 'IRR' as const });
    return {
      couponCode: outcome.couponCode,
      couponError: outcome.couponError,
      applied: outcome.result.applied.map((a) => ({
        promotionId: a.promotionId,
        name: a.name,
        kind: a.kind,
        discount: money(a.itemDiscount),
        shippingDiscount: money(a.shippingDiscount),
      })),
      itemDiscount: money(outcome.result.itemDiscount),
      payable: money(outcome.subtotal - outcome.result.itemDiscount),
    };
  }

  /**
   * Hold capacity for an order inside the checkout transaction. Global capacity
   * uses conditional UPDATEs, so concurrent checkouts can never exceed a limit;
   * per-customer limits are enforced under the SERIALIZABLE checkout isolation.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    input: { orderId: string; customerId: string; result: EngineResult; now: Date },
  ): Promise<void> {
    for (const a of input.result.applied) {
      const promotion = await tx.promotion.findUniqueOrThrow({ where: { id: a.promotionId } });
      if (!promotion.isActive) throw new CouponRejection('COUPON_INACTIVE');
      if (promotion.perCustomerLimit !== null) {
        const used = await this.customerUsage(tx, promotion.id, input.customerId);
        if (used >= promotion.perCustomerLimit) throw new CouponRejection('COUPON_CUSTOMER_LIMIT');
      }
      const claimed = await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = "usedCount" + 1, "updatedAt" = ${input.now}
        WHERE "id" = ${a.promotionId} AND "isActive" = true AND ("maxRedemptions" IS NULL OR "usedCount" < "maxRedemptions")`;
      if (claimed !== 1) throw new CouponRejection('COUPON_EXHAUSTED');
      if (a.couponId) {
        const coupon = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
          WHERE "id" = ${a.couponId} AND "isActive" = true AND ("maxRedemptions" IS NULL OR "usedCount" < "maxRedemptions")`;
        if (coupon !== 1) throw new CouponRejection('COUPON_EXHAUSTED');
      }
      await tx.promotionRedemption.create({
        data: {
          promotionId: a.promotionId,
          couponId: a.couponId,
          orderId: input.orderId,
          customerId: input.customerId,
          status: 'RESERVED',
          discountAmount: a.itemDiscount + a.shippingDiscount,
          shippingDiscount: a.shippingDiscount,
          snapshot: {
            name: a.name,
            kind: a.kind,
            percentBp: promotion.percentBp,
            amount: promotion.amount?.toString() ?? null,
            maxDiscount: promotion.maxDiscount?.toString() ?? null,
            promotionVersion: promotion.version,
            itemDiscount: a.itemDiscount.toString(),
            shippingDiscount: a.shippingDiscount.toString(),
            allocations: a.allocations.map((l) => ({ variantId: l.variantId, amount: l.amount.toString() })),
          },
        },
      });
    }
  }

  /** Verified settlement. Idempotent: only RESERVED rows change. */
  async confirmForOrder(tx: Prisma.TransactionClient, orderId: string, now = new Date()): Promise<number> {
    const r = await tx.promotionRedemption.updateMany({
      where: { orderId, status: 'RESERVED' },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });
    return r.count;
  }

  /** Cancellation / expiry. Only RESERVED capacity is returned; CONFIRMED is money-backed. */
  async releaseForOrder(tx: Prisma.TransactionClient, orderId: string, reason: string, now = new Date()): Promise<number> {
    const rows = await tx.promotionRedemption.findMany({ where: { orderId, status: 'RESERVED' } });
    let released = 0;
    for (const row of rows) {
      const flipped = await tx.promotionRedemption.updateMany({
        where: { id: row.id, status: 'RESERVED' },
        data: { status: 'RELEASED', releasedAt: now, releaseReason: reason.slice(0, 64) },
      });
      if (flipped.count !== 1) continue;
      await this.returnCapacity(tx, row.promotionId, row.couponId);
      released += 1;
    }
    return released;
  }

  /**
   * Refund rule: a partial refund keeps the usage consumed and records the
   * proportional share of the discount as refunded; a refund of the full paid
   * amount restores capacity (status REFUNDED). Idempotent per cumulative total.
   */
  async applyRefund(
    tx: Prisma.TransactionClient,
    orderId: string,
    input: { paidTotal: bigint; refundedTotal: bigint },
  ): Promise<void> {
    if (input.paidTotal <= 0n) return;
    const rows = await tx.promotionRedemption.findMany({ where: { orderId, status: { in: ['CONFIRMED', 'REFUNDED'] } } });
    const full = input.refundedTotal >= input.paidTotal;
    for (const row of rows) {
      if (row.status === 'REFUNDED') continue;
      const share = full ? row.discountAmount : (row.discountAmount * input.refundedTotal) / input.paidTotal;
      if (share < row.refundedDiscount) continue;
      if (full) {
        const flipped = await tx.promotionRedemption.updateMany({
          where: { id: row.id, status: 'CONFIRMED' },
          data: { status: 'REFUNDED', refundedDiscount: share, releasedAt: new Date(), releaseReason: 'FULL_REFUND' },
        });
        if (flipped.count === 1) await this.returnCapacity(tx, row.promotionId, row.couponId);
      } else {
        await tx.promotionRedemption.update({ where: { id: row.id }, data: { refundedDiscount: share } });
      }
    }
  }

  private async returnCapacity(tx: Prisma.TransactionClient, promotionId: string, couponId: string | null) {
    await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = "usedCount" - 1 WHERE "id" = ${promotionId} AND "usedCount" > 0`;
    if (couponId) {
      await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" - 1 WHERE "id" = ${couponId} AND "usedCount" > 0`;
    }
  }

  private async usable(db: Db, p: PromotionRow, customerId: string, excludeOrderId?: string): Promise<boolean> {
    if (p.maxRedemptions !== null && p.usedCount >= p.maxRedemptions) return false;
    if (p.perCustomerLimit !== null && (await this.customerUsage(db, p.id, customerId, excludeOrderId)) >= p.perCustomerLimit) return false;
    if (p.firstPurchaseOnly && !(await this.isFirstPurchase(db, customerId, excludeOrderId))) return false;
    return true;
  }

  private customerUsage(db: Db, promotionId: string, customerId: string, excludeOrderId?: string) {
    return db.promotionRedemption.count({
      where: {
        promotionId,
        customerId,
        status: { in: ['RESERVED', 'CONFIRMED'] },
        ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      },
    });
  }

  private async isFirstPurchase(db: Db, customerId: string, excludeOrderId?: string) {
    const prior = await db.order.count({
      where: {
        customerId,
        status: { in: ['PENDING_PAYMENT', 'PAID', 'CREDIT_APPROVED'] },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    });
    return prior === 0;
  }

  async categoryAncestry(db: Db): Promise<Map<string, string[]>> {
    const rows = await db.category.findMany({ select: { id: true, parentId: true } });
    const parent = new Map(rows.map((r) => [r.id, r.parentId]));
    const out = new Map<string, string[]>();
    for (const r of rows) {
      const chain: string[] = [];
      for (let id: string | null | undefined = r.id; id && !chain.includes(id); id = parent.get(id)) chain.push(id);
      out.set(r.id, chain);
    }
    return out;
  }
}

export function conflictFromRejection(error: CouponRejection): ConflictException {
  return new ConflictException({ code: error.code, message: error.message });
}

/** Shared stateless instance for services that join an existing transaction. */
export const promotionsService = new PromotionsService();
