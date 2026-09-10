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
  it('labels every order lifecycle state', () => {
    expect(ORDER_STATUS_LABELS).toEqual({
      PENDING: 'در انتظار',
      CONFIRMED: 'تأییدشده',
      PROCESSING: 'در حال پردازش',
      COMPLETED: 'تکمیل‌شده',
      CANCELLED: 'لغو شده',
    });
    expect(orderStatusLabel('PENDING')).toBe('در انتظار');
    expect(orderStatusTone('CANCELLED')).toBe('error');
  });

  it('labels every payment state', () => {
    expect(PAYMENT_STATUS_LABELS).toEqual({
      UNPAID: 'پرداخت نشده',
      PENDING: 'در انتظار پرداخت',
      PAID: 'پرداخت‌شده',
      PARTIALLY_REFUNDED: 'استرداد جزئی',
      REFUNDED: 'استردادشده',
    });
    expect(paymentStatusLabel('PAID')).toBe('پرداخت‌شده');
    expect(paymentStatusTone('PARTIALLY_REFUNDED')).toBe('info');
  });

  it('labels every fulfillment state', () => {
    expect(FULFILLMENT_STATUS_LABELS).toEqual({
      UNFULFILLED: 'تخصیص‌نیافته',
      ALLOCATED: 'تخصیص‌یافته',
      PICKING: 'در حال چیدن',
      PACKED: 'بسته‌بندی‌شده',
      SHIPPED: 'ارسال‌شده',
      DELIVERED: 'تحویل‌شده',
    });
    expect(fulfillmentStatusLabel('DELIVERED')).toBe('تحویل‌شده');
    expect(fulfillmentStatusTone('UNFULFILLED')).toBe('neutral');
  });

  it('formats Rial amounts and counts with Persian digits', () => {
    expect(formatRial(4_650_000)).toBe('۴٬۶۵۰٬۰۰۰ ریال');
    expect(formatRial(Number.NaN)).toBe('—');
    expect(formatCount(1_250)).toBe('۱٬۲۵۰');
  });
});