import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type {
  CheckoutAddress,
  CheckoutPreviewResponse,
} from '@iranyaragh/contracts';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { STAFF_PICKUP_POLICY } from './staff-pickup-policy';
import { buildCartView, cartInclude, pricingLines } from './cart-view';
import { promotionsService } from '../promotions/promotions.service';
import {
  checkoutAddressHash,
  normalizeCheckoutAddress,
} from './checkout-address';
import {
  type ShippingQuotePort,
  shippingQuoteContract,
  type ValidatedShippingQuote,
} from './shipping-quote.port';

const SHIPPING_QUOTE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ConfiguredShippingQuoteAdapter implements ShippingQuotePort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Cart-independent quotation only. Reuses current approved fixed tariffs; creates no cart/checkout quote. */
  async quoteForDraft(tx: Prisma.TransactionClient, code: string, inputAddress: CheckoutAddress) {
    normalizeCheckoutAddress(inputAddress);
    if (code === STAFF_PICKUP_POLICY.code) return { code, title: STAFF_PICKUP_POLICY.title, amount: STAFF_PICKUP_POLICY.amount, policyRevision: STAFF_PICKUP_POLICY.revision };
    const method = await tx.shippingMethod.findUnique({ where: { code } });
    if (!method?.isActive) throw new ConflictException({ code: 'SHIPPING_UNAVAILABLE', message: 'An active approved shipping tariff is required.' });
    return { code: method.code, title: method.title, amount: method.amount, policyRevision: method.policyRevision };
  }

  async previewForUser(
    userId: string,
    inputAddress: CheckoutAddress,
  ): Promise<CheckoutPreviewResponse> {
    const address = normalizeCheckoutAddress(inputAddress);
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
    });
    if (!customer) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Customer profile is not linked to the authenticated user.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { customerId: customer.id },
        include: { ...cartInclude(), couponIntent: true },
      });
      if (!cart || cart.items.length === 0) {
        throw new ConflictException({
          code: 'CART_EMPTY',
          message: 'Cart is empty.',
        });
      }
      if (
        cart.items.some(
          ({ variant }) =>
            !variant.isActive ||
            variant.status !== 'ACTIVE' ||
            variant.product.status !== 'ACTIVE',
        )
      ) {
        throw new ConflictException({
          code: 'QUOTE_CHANGED',
          message: 'Cart contents changed and must be reviewed.',
        });
      }

      const methods = await tx.shippingMethod.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      });
      if (methods.length === 0) {
        throw new ConflictException({
          code: 'SHIPPING_UNAVAILABLE',
          message: 'No shipping method is currently available.',
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + SHIPPING_QUOTE_TTL_MS);
      const cartView = buildCartView(cart, now);
      const subtotal = BigInt(cartView.quote.subtotal.amount);
      const addressHash = checkoutAddressHash(address);

      await tx.shippingQuote.deleteMany({
        where: {
          customerId: customer.id,
          consumedAt: null,
          expiresAt: { lte: now },
        },
      });

      const shipping = [];
      let promotion: ReturnType<typeof promotionsService.cartView> | undefined;
      for (const method of methods) {
        // Free-shipping discounts depend on the method, so each quote is priced
        // independently from current server-side rules.
        const priced = await promotionsService.price(tx, {
          customerId: customer.id,
          lines: pricingLines(cart),
          shipping: method.amount,
          couponCode: cart.couponIntent?.code ?? null,
          now,
        });
        promotion ??= promotionsService.cartView(priced);
        const quote = await tx.shippingQuote.create({
          data: {
            customerId: customer.id,
            cartId: cart.id,
            cartVersion: cart.version,
            shippingMethodId: method.id,
            methodCode: method.code,
            methodTitle: method.title,
            addressHash,
            subtotal,
            amount: method.amount,
            promotionDiscount: priced.result.totalDiscount,
            pricePolicyRevision: cartView.quote.pricePolicyRevision,
            policyRevision: method.policyRevision,
            expiresAt,
          },
        });
        shipping.push(shippingQuoteContract(quote));
      }

      return { data: { cart: { ...cartView, ...(promotion ? { promotion } : {}) }, shipping } };
    });
  }

  async requireValidQuote(
    tx: Prisma.TransactionClient,
    input: {
      quoteId: string;
      customerId: string;
      cartId: string;
      cartVersion: number;
      address: CheckoutAddress;
      now: Date;
    },
  ): Promise<ValidatedShippingQuote> {
    const quote = await tx.shippingQuote.findUnique({
      where: { id: input.quoteId },
      include: { shippingMethod: true },
    });
    const valid =
      quote &&
      quote.customerId === input.customerId &&
      quote.cartId === input.cartId &&
      quote.cartVersion === input.cartVersion &&
      quote.consumedAt === null &&
      quote.orderId === null &&
      quote.expiresAt > input.now &&
      quote.addressHash === checkoutAddressHash(input.address) &&
      quote.shippingMethod.isActive &&
      quote.methodCode === quote.shippingMethod.code &&
      quote.methodTitle === quote.shippingMethod.title &&
      quote.amount === quote.shippingMethod.amount &&
      quote.policyRevision === quote.shippingMethod.policyRevision;

    if (!valid) {
      throw new ConflictException({
        code: 'SHIPPING_QUOTE_CHANGED',
        message: 'Shipping quote is expired or no longer valid.',
      });
    }
    return quote;
  }
}
