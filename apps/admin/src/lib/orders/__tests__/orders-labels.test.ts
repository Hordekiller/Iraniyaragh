import { describe, expect, it } from 'vitest';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatCount,
  formatRial,
  fulfillmentStatusLabel,
  fulfillmentStatusTone,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from '../orders-labels';

describe('orders-labels', () => {
  it('covers every contract order state', () => {
    expect(ORDER_STATUS_LABELS).toEqual({
      DRAFT: 'پیش‌نویس',
      PENDING_PAYMENT: 'در انتظار پرداخت',
      PAID: 'پرداخت‌شده',
      CANCELLED: 'لغوشده',
      RETURNED: 'مرجوع‌شده',
    });
    expect(orderStatusLabel('PENDING_PAYMENT')).toBe('در انتظار پرداخت');
    expect(orderStatusTone('CANCELLED')).toBe('error');
  });

  it('covers every contract payment state and the null state', () => {
    expect(Object.keys(PAYMENT_STATUS_LABELS)).toEqual([
      'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED',
    ]);
    expect(paymentStatusLabel('PAID')).toBe('پرداخت‌شده');
    expect(paymentStatusTone('FAILED')).toBe('error');
    expect(paymentStatusLabel(null)).toBe('بدون تلاش پرداخت');
    expect(paymentStatusTone(null)).toBe('neutral');
  });

  it('covers every contract fulfillment state and the null state', () => {
    expect(Object.keys(FULFILLMENT_STATUS_LABELS)).toEqual([
      'PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED',
    ]);
    expect(fulfillmentStatusLabel('DELIVERED')).toBe('تحویل‌شده');
    expect(fulfillmentStatusTone('CANCELLED')).toBe('error');
    expect(fulfillmentStatusLabel(null)).toBe('شروع نشده');
  });

  it('formats large integer Rial strings without precision loss', () => {
    expect(formatRial({ amount: '4650000', currency: 'IRR' })).toBe('۴٬۶۵۰٬۰۰۰ ریال');
    expect(formatRial('9007199254740993000')).toBe('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۰۰۰ ریال');
    expect(formatRial('invalid')).toBe('—');
    expect(formatCount(1_250)).toBe('۱٬۲۵۰');
  });
});
