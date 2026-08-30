import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { AppError, ErrorCodes } from '../../common/errors/app-error';
import { toRialNumber } from '../../common/money/money';
import { withSerializableRetry } from '../../common/prisma/transaction-retry';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import { guardTransition, ORDER_TRANSITIONS } from '../../common/domain/state-machine';

export interface OrderOwner {
  userId?: string | null;
  customerId?: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async list(owner: OrderOwner, page: number, limit: number) {
    const where: Prisma.OrderWhereInput = owner.userId
      ? { userId: owner.userId }
      : owner.customerId
        ? { customerId: owner.customerId }
        : {};
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { items: { select: { id: true, sku: true, title: true, quantity: true, unitPrice: true, total: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        fulfillmentStatus: o.fulfillmentStatus,
        grandTotal: toRialNumber(o.grandTotal) ?? 0,
        createdAt: o.createdAt,
        items: o.items.length,
      })),
      meta: buildPageMeta(total, page, limit),
    };
  }

  async detail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: true,
        reservations: { include: { sku: { select: { sku: true } } } },
      },
    });
    if (!order) throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found.', 404);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      subtotal: toRialNumber(order.subtotal) ?? 0,
      discount: toRialNumber(order.discount) ?? 0,
      shipping: toRialNumber(order.shipping) ?? 0,
      grandTotal: toRialNumber(order.grandTotal) ?? 0,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        title: i.title,
        quantity: i.quantity,
        unitPrice: toRialNumber(i.unitPrice) ?? 0,
        total: toRialNumber(i.total) ?? 0,
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amount: toRialNumber(p.amount) ?? 0,
      })),
      reservations: order.reservations.map((r) => ({
        id: r.id,
        sku: r.sku.sku,
        quantity: r.quantity,
        status: r.status,
        expiresAt: r.expiresAt,
      })),
    };
  }

  async cancel(orderId: string): Promise<{ id: string; status: string }> {
    return withSerializableRetry(this.prisma, async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { reservations: true },
      });
      if (!order) throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found.', 404);

      const nextStatus = guardTransition<OrderStatus>(
        order.status,
        OrderStatus.CANCELLED,
        ORDER_TRANSITIONS as unknown as Record<OrderStatus, readonly OrderStatus[]>,
      );

      // Release any active reservations back to availability.
      for (const reservation of order.reservations.filter((r) => r.status === 'ACTIVE')) {
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            warehouseId_locationId_skuId: {
              warehouseId: reservation.warehouseId,
              locationId: reservation.locationId,
              skuId: reservation.skuId,
            },
          },
        });
        if (balance && balance.reserved >= reservation.quantity) {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              reserved: { decrement: reservation.quantity },
              available: { increment: reservation.quantity },
              version: { increment: 1 },
            },
          });
          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: { status: 'RELEASED' },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });
      return { id: updated.id, status: updated.status };
    });
  }
}
