import { ConflictException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { CartResponse } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { COUPON_CODE_PATTERN, normalizeCouponCode } from '../promotions/promotion-engine';
import { CouponRateLimitService } from '../promotions/coupon-rate-limit.service';
import { couponMessage, promotionsService } from '../promotions/promotions.service';
import { CartService } from './cart.service';
import { cartInclude, pricingLines } from './cart-view';

@Injectable()
export class CartCouponService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CartService) private readonly cart: CartService,
    @Inject(CouponRateLimitService) private readonly limiter: CouponRateLimitService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async apply(userId: string, rawCode: string, requestId: string): Promise<CartResponse> {
    const customer = await this.customer(userId);
    await this.limiter.enforce(customer.id);
    const code = typeof rawCode === 'string' ? normalizeCouponCode(rawCode) : '';
    if (!COUPON_CODE_PATTERN.test(code)) {
      throw new UnprocessableEntityException({ code: 'COUPON_NOT_FOUND', message: couponMessage('COUPON_NOT_FOUND') });
    }
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { customerId: customer.id }, include: cartInclude() });
      if (!cart || cart.items.length === 0) throw new ConflictException({ code: 'CART_EMPTY', message: 'Cart is empty.' });
      const outcome = await promotionsService.price(tx, {
        customerId: customer.id, lines: pricingLines(cart), shipping: 0n, couponCode: code, now: new Date(),
      });
      if (outcome.couponError) {
        throw new UnprocessableEntityException({ code: outcome.couponError.code, message: outcome.couponError.message });
      }
      await tx.cartCouponIntent.upsert({ where: { cartId: cart.id }, create: { cartId: cart.id, code }, update: { code } });
      // Invalidates any shipping quote priced without this coupon.
      await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      await this.audit.record({ action: 'cart.coupon.applied', entityType: 'cart', entityId: cart.id, metadata: { code }, actorId: userId, requestId }, tx);
    });
    return this.cart.getForUser(userId);
  }

  async remove(userId: string, requestId: string): Promise<CartResponse> {
    const customer = await this.customer(userId);
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { customerId: customer.id }, select: { id: true } });
      if (!cart) return;
      const removed = await tx.cartCouponIntent.deleteMany({ where: { cartId: cart.id } });
      if (removed.count > 0) {
        await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
        await this.audit.record({ action: 'cart.coupon.removed', entityType: 'cart', entityId: cart.id, actorId: userId, requestId }, tx);
      }
    });
    return this.cart.getForUser(userId);
  }

  private async customer(userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId }, select: { id: true } });
    if (!customer) throw new ConflictException({ code: 'CUSTOMER_ACCOUNT_REQUIRED', message: 'Initialize an owned customer profile before using the customer cart.' });
    return customer;
  }
}
