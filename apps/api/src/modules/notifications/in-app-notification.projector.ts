import { Injectable } from '@nestjs/common';
import type { InAppNotificationAudience, Prisma } from '@prisma/client';

type Draft = { audience: InAppNotificationAudience; kind: string; title: string; body: (orderNumber: string) => string; href: (orderId: string) => string };

const customer = (kind: string, title: string, body: string): Draft => ({ audience: 'CUSTOMER', kind, title, body: n => `${body} (سفارش ${n})`, href: id => `/orders/${id}` });
const staff = (kind: string, title: string, body: string): Draft => ({ audience: 'STAFF', kind, title, body: n => `${body} (سفارش ${n})`, href: id => `/orders/${id}` });

/** Topic → notifications. Only facts already recorded by the outbox are announced; no payload/PII is copied. */
export const NOTIFICATION_DRAFTS: Readonly<Record<string, readonly Draft[]>> = {
  ORDER_CREATED: [customer('ORDER_CREATED', 'سفارش ثبت شد', 'سفارش شما ثبت شد و منتظر پرداخت است'), staff('ORDER_CREATED', 'سفارش جدید', 'یک سفارش جدید ثبت شد')],
  ORDER_CANCELLED: [customer('ORDER_CANCELLED', 'سفارش لغو شد', 'سفارش شما لغو شد'), staff('ORDER_CANCELLED', 'سفارش لغو شد', 'یک سفارش لغو شد')],
  ORDER_EXPIRED: [customer('ORDER_EXPIRED', 'مهلت پرداخت تمام شد', 'مهلت پرداخت سفارش به پایان رسید')],
  PAYMENT_VERIFIED: [customer('PAYMENT_VERIFIED', 'پرداخت تأیید شد', 'پرداخت شما با موفقیت تأیید شد'), staff('PAYMENT_VERIFIED', 'پرداخت تأیید شد', 'پرداخت یک سفارش تأیید شد')],
  PAYMENT_VERIFICATION_FAILED: [customer('PAYMENT_FAILED', 'پرداخت ناموفق بود', 'پرداخت شما تأیید نشد'), staff('PAYMENT_FAILED', 'پرداخت ناموفق', 'پرداخت یک سفارش تأیید نشد')],
  PAYMENT_VERIFICATION_UNCONFIRMED: [staff('PAYMENT_UNCONFIRMED', 'نیاز به بررسی پرداخت', 'نتیجهٔ پرداخت مشخص نیست و نیاز به بررسی دارد')],
  PAYMENT_VERIFIED_AFTER_CANCELLED: [staff('PAYMENT_REFUND_REVIEW', 'پرداخت پس از لغو سفارش', 'پرداخت پس از لغو تأیید شد و نیاز به بررسی بازپرداخت دارد')],
  PAYMENT_REFUNDED: [customer('PAYMENT_REFUNDED', 'بازپرداخت ثبت شد', 'بازپرداخت سفارش شما ثبت شد')],
  SHIPMENT_DISPATCHED: [customer('SHIPMENT_DISPATCHED', 'سفارش ارسال شد', 'سفارش شما تحویل حمل‌ونقل شد')],
  SHIPMENT_DELIVERED: [customer('SHIPMENT_DELIVERED', 'سفارش تحویل داده شد', 'سفارش شما تحویل داده شد')],
  DOOR_QUOTE_APPROVED: [customer('DOOR_QUOTE_APPROVED', 'پیش‌فاکتور تأیید شد', 'پیش‌فاکتور درب سفارشی شما تأیید شد')],
};

/** Staff are recipients when an active role grants this permission. */
const STAFF_PERMISSION = 'orders.read';

@Injectable()
export class InAppNotificationProjector {
  /** Runs inside the outbox consumer transaction; `dedupKey` makes redelivery a no-op. */
  async project(tx: Prisma.TransactionClient, event: { id: string; topic: string }, orderId: string): Promise<void> {
    const drafts = NOTIFICATION_DRAFTS[event.topic];
    if (!drafts?.length) return;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { number: true, customer: { select: { userId: true } } } });
    if (!order) return;
    const now = new Date();
    const rows: Prisma.InAppNotificationCreateManyInput[] = [];
    for (const draft of drafts) {
      let userIds: string[] = [];
      if (draft.audience === 'CUSTOMER') {
        if (order.customer.userId) userIds = [order.customer.userId];
      } else {
        const users = await tx.user.findMany({
          where: {
            status: 'ACTIVE', deletedAt: null,
            roleAssignments: { some: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], role: { isActive: true, permissions: { some: { revokedAt: null, permission: { key: STAFF_PERMISSION, isActive: true } } } } } },
          },
          select: { id: true },
        });
        userIds = users.map(user => user.id);
      }
      for (const userId of userIds) {
        rows.push({ userId, audience: draft.audience, kind: draft.kind, title: draft.title, body: draft.body(order.number), href: draft.href(orderId), dedupKey: `${event.id}:${draft.audience}` });
      }
    }
    if (rows.length) await tx.inAppNotification.createMany({ data: rows, skipDuplicates: true });
  }
}
