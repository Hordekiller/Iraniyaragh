import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, ErrorCodes } from '../../common/errors/app-error';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface AlertIdentity {
  userId?: string | null;
  guestToken?: string | null;
}

@Injectable()
export class StockAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async subscribe(identity: AlertIdentity, skuId: string, channel: 'SMS' | 'EMAIL' = 'SMS') {
    const { userId, guestToken } = identity;
    if (!userId && !guestToken) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'A userId or guestToken is required.', 401);
    }
    const sku = await this.prisma.sku.findUnique({ where: { id: skuId }, select: { id: true } });
    if (!sku) throw new AppError(ErrorCodes.SKU_NOT_FOUND, 'SKU not found.', 404);

    try {
      const created = await this.prisma.stockAlertSubscription.create({
        data: { userId: userId ?? null, guestToken: guestToken ?? null, skuId, channel },
      });
      return { id: created.id, skuId, status: created.status, subscribed: true };
    } catch (e) {
      // @@unique([skuId,userId]) / @@unique([skuId,guestToken]) -> already subscribed.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.stockAlertSubscription.findFirst({
          where: { skuId, ...(userId ? { userId } : { guestToken }) },
        });
        return { id: existing!.id, skuId, status: existing!.status, subscribed: true, already: true };
      }
      throw e;
    }
  }

  async cancel(identity: AlertIdentity, subscriptionId: string) {
    const { userId, guestToken } = identity;
    if (!userId && !guestToken) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'A userId or guestToken is required.', 401);
    }
    const sub = await this.prisma.stockAlertSubscription.findFirst({
      where: { id: subscriptionId, ...(userId ? { userId } : { guestToken }) },
    });
    if (!sub) throw new AppError(ErrorCodes.NOT_FOUND, 'Subscription not found.', 404);

    const updated = await this.prisma.stockAlertSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED' },
    });
    return { id: updated.id, status: updated.status };
  }

  async list(identity: AlertIdentity) {
    const { userId, guestToken } = identity;
    if (!userId && !guestToken) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'A userId or guestToken is required.', 401);
    }
    const items = await this.prisma.stockAlertSubscription.findMany({
      where: { status: 'ACTIVE', ...(userId ? { userId } : { guestToken }) },
      include: { sku: { select: { sku: true, product: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((s) => ({
      id: s.id,
      skuId: s.skuId,
      sku: s.sku.sku,
      productTitle: s.sku.product.name,
      channel: s.channel,
      status: s.status,
      createdAt: s.createdAt,
    }));
  }

  async triggerRestock(skuId: string): Promise<{ notified: number }> {
    const sku = await this.prisma.sku.findUnique({ where: { id: skuId }, select: { sku: true } });
    if (!sku) throw new AppError(ErrorCodes.SKU_NOT_FOUND, 'SKU not found.', 404);
    const notified = await this.notifications.notifyStockRestocked(skuId, sku.sku);
    return { notified };
  }
}
