import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';

export const stocktakeOutcomeIsUncertain = (failure: unknown) => failure instanceof ApiNetworkError ||
  failure instanceof ApiAbortError || (failure instanceof ApiClientError && (failure.statusCode >= 500 || failure.code === 'RETRYABLE_CONFLICT'));

export function stocktakeError(failure: unknown): string {
  if (stocktakeOutcomeIsUncertain(failure)) return 'نتیجهٔ دستور هنوز مشخص نیست. وضعیت را بازخوانی کنید و فقط همان دستور را با همان کلید تکرار کنید.';
  if (failure instanceof ApiClientError) {
    const messages: Record<string, string> = {
      STOCKTAKE_VERSION_CONFLICT: 'برگه هم‌زمان تغییر کرده است. وضعیت جدید را بازخوانی و دوباره بررسی کنید.',
      STOCKTAKE_STATE_CONFLICT: 'این عملیات در وضعیت فعلی برگه مجاز نیست.',
      STOCKTAKE_NOT_FULLY_COUNTED: 'پیش از ارسال برای بازبینی، همهٔ خطوط باید شمارش شوند.',
      STOCKTAKE_RESERVED_EXCEEDS_COUNT: 'تعداد شمارش کمتر از موجودی رزروشده است. ابتدا رزروها را از مسیر مجاز بررسی کنید؛ هیچ تغییری اعمال نشد.',
      STOCKTAKE_SCOPE_TOO_LARGE: 'برگه بیش از ۵۰۰ خط دارد. دامنه را به مکان یا SKU محدودتری تقسیم کنید.',
      STOCKTAKE_LINE_REQUIRED: 'در این دامنه موجودی‌ای برای شمارش وجود ندارد.',
      STOCKTAKE_OUT_OF_SCOPE: 'خط شمارش خارج از دامنهٔ ثابت این برگه است.',
      IDEMPOTENCY_CONFLICT: 'کلید دستور با دادهٔ متفاوت استفاده شده است. نتیجهٔ قبلی را بررسی کنید.',
      WAREHOUSE_INACTIVE: 'انبار فعال نیست.',
      LOCATION_INACTIVE: 'مکان فعال یا متعلق به این انبار نیست.',
      VALIDATION_ERROR: 'دادهٔ شمارش معتبر نیست؛ تعداد باید عدد صحیح غیرمنفی و یادداشت حداکثر ۵۰۰ نویسه باشد.',
      STOCKTAKE_NOT_FOUND: 'برگهٔ انبارگردانی پیدا نشد.',
    };
    if (['AUTH_REAUTHENTICATION_REQUIRED', 'AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'].includes(failure.code)) return failure.message;
    if (failure.statusCode === 403) return 'مجوز انجام این عملیات را ندارید.';
    return messages[failure.code] ?? 'عملیات انبارگردانی ناموفق بود؛ وضعیت برگه را بررسی کنید.';
  }
  return 'دریافت یا ثبت اطلاعات انبارگردانی ناموفق بود. اتصال را بررسی کنید.';
}

export function parseStocktakeQuantity(value: string): number | null {
  const normalized = value.trim().replace(/[۰-۹]/gu, digit => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/gu, digit => String(digit.charCodeAt(0) - 1632));
  if (!/^[0-9]{1,10}$/u.test(normalized)) return null;
  const quantity = Number(normalized);
  return quantity <= 2_147_483_647 ? quantity : null;
}
