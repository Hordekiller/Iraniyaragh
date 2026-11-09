import type { ReturnDisposition, ReturnIneligibleReason, ReturnWindowKind } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';

export const returnWindowLabels: Record<ReturnWindowKind, string> = {
  IN_PERSON: 'تحویل حضوری؛ ۲ روز کاری از صدور فاکتور',
  DELIVERY: 'ارسال به شهر دیگر؛ ۱ هفته (۷ روز تقویمی) از صدور فاکتور',
};

export const returnWindowShortLabels: Record<ReturnWindowKind, string> = { IN_PERSON: 'حضوری', DELIVERY: 'شهر دیگر' };

export const returnIneligibleLabels: Record<ReturnIneligibleReason, string> = {
  RETURNS_DISABLED: 'ثبت مرجوعی جدید در «تنظیمات ← مهلت مرجوعی و تعطیلات» غیرفعال است. مرجوعی‌های ثبت‌شدهٔ قبلی و ثبت استرداد آن‌ها همچنان ممکن است.',
  ORDER_NOT_PAID: 'سفارش پرداخت‌شده نیست.',
  PAYMENT_NOT_SETTLED: 'پرداخت تأییدشده‌ای برای این سفارش ثبت نشده است.',
  CUSTOM_DOOR_EXCLUDED: 'سفارش ساخت درب سفارشی مشمول این جریان مرجوعی نیست.',
  NO_ISSUED_INVOICE: 'فاکتور صادرشده‌ای برای این سفارش وجود ندارد؛ مهلت مرجوعی از لحظهٔ صدور فاکتور آغاز می‌شود.',
  METHOD_UNCLASSIFIED: 'روش ارسال این سفارش هنوز در «تنظیمات ارسال» به‌عنوان حضوری یا شهر دیگر مشخص نشده است.',
  WINDOW_CLOSED: 'مهلت مرجوعی به پایان رسیده و ثبت مرجوعی امکان‌پذیر نیست.',
  FULLY_RETURNED: 'همهٔ اقلام این سفارش قبلاً مرجوع شده است.',
  AMOUNTS_DO_NOT_RECONCILE: 'مبلغ سفارش و پرداخت هم‌خوان نیست؛ ابتدا مغایرت مالی را بررسی کنید.',
};

export const returnDispositionLabels: Record<ReturnDisposition, string> = {
  RESTOCK: 'سالم؛ بازگشت به موجودی قابل‌فروش',
  DAMAGED: 'آسیب‌دیده یا غیرقابل‌فروش (وارد موجودی نمی‌شود)',
  NOT_RETURNED: 'کالا بازنگشته (وارد موجودی نمی‌شود)',
};

/** A network failure or 5xx leaves the outcome unknown: the same key must be retried, never a new one. */
export const returnOutcomeUnknown = (error: unknown) =>
  error instanceof ApiNetworkError || error instanceof ApiAbortError || (error instanceof ApiClientError && error.statusCode >= 500);

export function returnErrorMessage(error: unknown, command = true): string {
  if (command && returnOutcomeUnknown(error)) {
    return 'نتیجهٔ ثبت هنوز مشخص نیست؛ وضعیت را بازخوانی کنید و همان دستور را با همان کلید دوباره بررسی کنید.';
  }
  if (error instanceof ApiClientError) {
    if (error.code.startsWith('AUTH_')) return error.message;
    if (error.statusCode === 403) return 'مجوز این عملیات را ندارید.';
    const messages: Record<string, string> = {
      RETURN_SETTINGS_STALE: 'تنظیم در این فاصله تغییر کرده است؛ نسخهٔ جدید دریافت شد، دوباره بررسی و ذخیره کنید.',
      RETURN_NOT_ELIGIBLE: 'این سفارش در وضعیت فعلی قابل مرجوع‌شدن نیست؛ وضعیت را بازخوانی کنید.',
      RETURN_QUANTITY_EXCEEDED: 'تعداد مرجوعی بیشتر از تعداد فروخته‌شده یا باقی‌ماندهٔ قابل مرجوع است؛ بازخوانی کنید.',
      RETURN_INPUT_INVALID: 'اطلاعات مرجوعی معتبر نیست؛ دلیل، تعداد، وضعیت کالا و انبار/محل مقصد را بررسی کنید.',
      RETURN_REFUND_EXCEEDED: 'مبلغ استرداد بیشتر از باقی‌ماندهٔ قابل‌استرداد این مرجوعی است.',
      RETURN_NOT_FOUND: 'سفارش یا مرجوعی پیدا نشد.',
      RETURN_HOLIDAY_EXISTS: 'این تاریخ قبلاً به‌عنوان تعطیلی ثبت شده است.',
      RETURN_IDEMPOTENCY_CONFLICT: 'کلید ثبت با دادهٔ دیگری استفاده شده؛ نتیجهٔ قبلی را بررسی کنید.',
      REFUND_AMOUNT_EXCEEDS_REMAINING: 'مبلغ استرداد بیشتر از باقی‌ماندهٔ قابل‌استرداد پرداخت است.',
      PAYMENT_STATE_CONFLICT: 'پرداخت در وضعیتی نیست که بتوان برایش استرداد ثبت کرد.',
      INSUFFICIENT_STOCK: 'ثبت موجودی انجام نشد؛ انبار و محل را بررسی کنید.',
      IDEMPOTENCY_CONFLICT: 'کلید ثبت با دادهٔ دیگری استفاده شده؛ نتیجهٔ قبلی را بررسی کنید.',
      INVALID_REQUEST: 'اطلاعات واردشده معتبر نیست.',
    };
    return messages[error.code] ?? 'عملیات مرجوعی انجام نشد؛ وضعیت را بازخوانی و بررسی کنید.';
  }
  return 'ارتباط با سامانه برقرار نشد؛ اتصال را بررسی کنید.';
}
