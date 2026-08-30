import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SMS_SENDER, SmsSender } from './sms-sender';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  /**
   * Notify every ACTIVE subscriber of a SKU that it has been restocked.
   * Dedupe is enforced by flipping ACTIVE -> NOTIFIED via a guarded updateMany,
   * so concurrent restock calls cannot double-notify.
   */
  async notifyStockRestocked(skuId: string, sku: string): Promise<number> {
    const subscribers = await this.prisma.stockAlertSubscription.findMany({
      where: { skuId, status: 'ACTIVE' },
      include: { user: { select: { mobile: true } } },
    });

    let notified = 0;
    for (const sub of subscribers) {
      const target = sub.user?.mobile;
      if (!target) continue;

      const claimed = await this.prisma.stockAlertSubscription.updateMany({
        where: { id: sub.id, status: 'ACTIVE', notifiedAt: null },
        data: { status: 'NOTIFIED', notifiedAt: new Date() },
      });
      if (claimed.count === 0) continue; // already notified concurrently

      await this.sms.send({
        to: target,
        template: '{{sku}} موجود شد. همین حالا سفارش دهید.',
        params: { sku },
      });
      notified += 1;
    }
    return notified;
  }
}
