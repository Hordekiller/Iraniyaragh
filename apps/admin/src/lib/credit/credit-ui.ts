import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
export const creditOutcomeUnknown = (error: unknown) => error instanceof ApiNetworkError || error instanceof ApiAbortError || (error instanceof ApiClientError && error.statusCode >= 500);
export function creditError(error: unknown, command = true): string {
  if (command && creditOutcomeUnknown(error)) return 'نتیجهٔ ثبت هنوز مشخص نیست؛ وضعیت را بازخوانی و همان دستور را با همان کلید دوباره بررسی کنید.';
  if (error instanceof ApiClientError) {
    if (error.code.startsWith('AUTH_')) return error.message;
    if (error.statusCode === 403) return 'مجوز این عملیات را ندارید.';
    const messages: Record<string, string> = {
      CREDIT_VERSION_CONFLICT: 'حساب هم‌زمان تغییر کرده؛ بازخوانی کنید و دادهٔ جدید را بررسی کنید.',
      CREDIT_OPENING_EXISTS: 'ماندهٔ اول دوره قبلاً ثبت شده؛ برای اصلاح سند جبرانی ثبت کنید.',
      CREDIT_ALLOCATION_CONFLICT: 'مبلغ تخصیص بیشتر از بدهی باز سند است.',
      CREDIT_ADJUSTMENT_CONFLICT: 'بستانکاری نمی‌تواند بیشتر از بدهی پرداخت‌نشده باشد.',
      CREDIT_RECEIPT_REVERSED: 'این دریافت قبلاً برگشت خورده است.',
      CREDIT_EVIDENCE_CONFLICT: 'این سند دریافت قبلاً ثبت شده است.',
      CREDIT_RETURN_CONFLICT: 'سند برگشت، مقدار کالا، بدهی یا مبلغ قابل‌برگشت با وضعیت فعلی سازگار نیست؛ اسناد را بازخوانی و بررسی کنید.',
      ORDER_VERSION_CONFLICT: 'سفارش تغییر کرده؛ آن را بازخوانی و بررسی کنید.',
      CREDIT_SALE_CONFLICT: 'فقط سفارش حضوری با رزرو معتبر و بدون شروع ارسال قابل تأیید نسیه است.',
      CREDIT_PAYMENT_CONFLICT: 'برای این سفارش تلاش پرداخت ثبت شده؛ امکان تبدیل به نسیه وجود ندارد.',
      CREDIT_ACCOUNT_INACTIVE: 'اعتبار یا حساب مشتری فعال نیست.',
      CREDIT_OVERDUE: 'مشتری بدهی سررسیدگذشته دارد؛ ابتدا آن را تسویه یا بررسی کنید.',
      CREDIT_LIMIT_EXCEEDED: 'مبلغ سفارش بیشتر از اعتبار قابل استفادهٔ مشتری است.',
      CREDIT_NOT_FOUND: 'حساب یا سند موردنظر پیدا نشد.',
      IDEMPOTENCY_CONFLICT: 'کلید ثبت با دادهٔ دیگری استفاده شده؛ نتیجهٔ قبلی را بررسی کنید.',
      VALIDATION_ERROR: 'مبلغ ریالی، تاریخ، تخصیص یا سند مرجع معتبر نیست.',
      CUSTOMER_INACTIVE: 'مشتری غیرفعال است و نمی‌توان اعتبار فعال کرد.',
    };
    return messages[error.code] ?? 'دریافت یا ثبت اطلاعات اعتبار ناموفق بود؛ وضعیت را بررسی کنید.';
  }
  return 'دریافت اطلاعات اعتبار ناموفق بود. اتصال را بررسی کنید.';
}
export function parseCreditIrr(value: string, zero = false): string | null {
  const normalized = value.trim().replace(/[۰-۹]/gu, digit => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/gu, digit => String(digit.charCodeAt(0) - 1632));
  if (!/^(0|[1-9][0-9]{0,18})$/u.test(normalized)) return null;
  const amount = BigInt(normalized);
  return amount <= 9_223_372_036_854_775_807n && (zero || amount > 0n) ? normalized : null;
}
export const creditRial = (amount: string) => `${new Intl.NumberFormat('fa-IR').format(BigInt(amount))} ریال`;
export const creditDate = (value: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export const creditKindLabels = { SALE: 'فروش نسیه', OPENING_BALANCE: 'ماندهٔ اول دوره', RECEIPT: 'دریافت وجه', RECEIPT_REVERSAL: 'برگشت دریافت', DEBIT_ADJUSTMENT: 'اصلاح بدهکار', CREDIT_NOTE: 'اصلاح بستانکار' };
export const receivableLabels = { CREDITED: 'بسته‌شده با برگشت', UNPAID: 'پرداخت‌نشده', PARTIALLY_PAID: 'پرداخت جزئی', PAID: 'تسویه‌شده', OVERDUE: 'سررسید گذشته' };
