import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { withSerializableRetry } from '../../common/prisma/transaction-retry';
import { AppError, ErrorCodes } from '../../common/errors/app-error';
import { toRialNumber, sumRial } from '../../common/money/money';
import { PrismaService } from '../../database/prisma.service';
import { CartIdentity, CartService } from '../cart/cart.service';
import { CheckoutCustomerDto } from './dto/checkout.dto';

const RESERVATION_TTL_MS = 30 * 60 * 1000;

export interface CheckoutResult {
  orderId: string;
  number: string;
  items: Array<{ skuId: string; title: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  discount: number;
  shipping: number;
  grandTotal: number;
  status: string;
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
  ) {}

  async checkout(
    identity: CartIdentity,
    idempotencyKey: string | undefined,
    customerPayload: CheckoutCustomerDto,
  ): Promise<CheckoutResult> {
    if (!idempotencyKey) {
      throw new AppError(ErrorCodes.IDEMPOTENCY_CONFLICT, 'idempotency key (Idempotency-Key) is required for checkout.', 400);
    }

    return withSerializableRetry(this.prisma, async (tx) => {
      // Idempotent replay: an order already exists for this key -> return it.
      const existing = await tx.order.findFirst({
        where: { idempotencyKey },
        include: { items: true },
      });
      if (existing) {
        return this.mapOrder(existing);
      }

      const cart = await tx.cart.findFirst({
        where: {
          OR: [
            ...(identity.userId ? [{ userId: identity.userId }] : []),
            ...(identity.guestToken ? [{ guestToken: identity.guestToken }] : []),
          ],
        },
        include: {
          items: { include: { sku: true } },
        },
      });

      const cartItems = cart?.items ?? [];
      if (!cartItems.length) {
        throw new AppError(ErrorCodes.CART_EMPTY, 'Cart is empty; nothing to checkout.', 400);
      }

      // Server-side pricing -------------------------------------------------
      const lines = await Promise.all(
        cartItems.map(async (item) => {
          const priceRow = await tx.price.findFirst({
            where: {
              skuId: item.skuId,
              isActive: true,
              effectiveFrom: { lte: new Date() },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
            },
            orderBy: { effectiveFrom: 'desc' },
          });
          if (!priceRow) {
            throw new AppError(ErrorCodes.PRICE_NOT_AVAILABLE, `No active price for SKU ${item.skuId}.`, 409);
          }
          if (item.quantity < priceRow.minQuantity) {
            throw new AppError(
              ErrorCodes.MIN_QUANTITY_NOT_MET,
              `Minimum quantity ${priceRow.minQuantity} required for SKU ${item.skuId}.`,
              409,
            );
          }
          const unitPrice = priceRow.amount;
          return {
            skuId: item.skuId,
            skuCode: item.sku.sku,
            title: item.sku.title ?? item.sku.sku,
            quantity: item.quantity,
            minQuantity: priceRow.minQuantity,
            unitPrice,
            total: unitPrice * BigInt(item.quantity),
          };
        }),
      );

      // To detect out-of-stock lines before we touch any balances, we verify
      // availability first without mutating, then allocate reservations after
      // the order and its items are persisted (reservation rows carry orderId).
      for (const line of lines) {
        await this.assertAvailability(tx, line.skuId, line.quantity);
      }

      const subtotal = sumRial(lines.map((l) => l.total));
      const discount = 0n;
      const shipping = 0n;
      const grandTotal = subtotal - discount + shipping;

      // Customer upsert -----------------------------------------------------
      const customer = await tx.customer.upsert({
        where: { mobile: customerPayload.mobile },
        create: customerPayload,
        update: {},
      });

      // Order + items -------------------------------------------------------
      const order = await tx.order.create({
        data: {
          number: await this.nextOrderNumber(tx),
          customerId: customer.id,
          userId: identity.userId ?? null,
          status: 'PENDING_PAYMENT',
          subtotal,
          discount,
          shipping,
          grandTotal,
          idempotencyKey,
          items: {
            create: lines.map((l) => ({
              skuId: l.skuId,
              sku: l.skuCode,
              title: l.title,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              total: l.total,
            })),
          },
        },
        include: { items: true },
      });

      // Allocate reservations against the persisted order and clear the cart --
      for (const line of lines) {
        await this.allocateReservation(tx, line.skuId, line.quantity, order.id);
      }
      await tx.cartItem.deleteMany({ where: { cartId: cart!.id } });

      return this.mapOrder(order);
    });
  }

  private async assertAvailability(
    tx: Prisma.TransactionClient,
    skuId: string,
    quantity: number,
  ) {
    const agg = await tx.inventoryBalance.aggregate({
      where: { skuId },
      _sum: { available: true },
    });
    if ((agg._sum.available ?? 0) < quantity) {
      throw new AppError(ErrorCodes.INSUFFICIENT_STOCK, 'Insufficient available stock.', 409);
    }
  }

  private async allocateReservation(
    tx: Prisma.TransactionClient,
    skuId: string,
    quantity: number,
    orderId: string,
  ) {
    const balances = await tx.inventoryBalance.findMany({
      where: { skuId, available: { gt: 0 } },
      orderBy: { available: 'desc' },
    });
    let remaining = quantity;
    const allAvailable = balances.reduce((acc, b) => acc + b.available, 0);
    if (allAvailable < quantity) {
      throw new AppError(ErrorCodes.INSUFFICIENT_STOCK, 'Insufficient available stock.', 409);
    }
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
    for (const balance of balances) {
      if (remaining <= 0) break;
      const take = Math.min(balance.available, remaining);
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          reserved: { increment: take },
          available: { decrement: take },
          version: { increment: 1 },
        },
      });
      await tx.stockReservation.create({
        data: {
          warehouseId: balance.warehouseId,
          locationId: balance.locationId,
          skuId: balance.skuId,
          orderId,
          quantity: take,
          expiresAt,
        },
      });
      remaining -= take;
    }
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.order.count();
    return `ORD-${String(count + 1).padStart(6, '0')}`;
  }

  private mapOrder(order: OrderWithItems): CheckoutResult {
    return {
      orderId: order.id,
      number: order.number,
      items: order.items.map((i) => ({
        skuId: i.skuId,
        title: i.title,
        quantity: i.quantity,
        unitPrice: toRialNumber(i.unitPrice) ?? 0,
        total: toRialNumber(i.total) ?? 0,
      })),
      subtotal: toRialNumber(order.subtotal) ?? 0,
      discount: toRialNumber(order.discount) ?? 0,
      shipping: toRialNumber(order.shipping) ?? 0,
      grandTotal: toRialNumber(order.grandTotal) ?? 0,
      status: order.status,
    };
  }
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;
