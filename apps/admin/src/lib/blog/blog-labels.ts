import type { BlogPostStatus } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';

export const STATUS_LABEL: Record<BlogPostStatus, string> = { DRAFT: 'پیش‌نویس', IN_REVIEW: 'در انتظار بازبینی', PUBLISHED: 'منتشرشده', ARCHIVED: 'بایگانی' };
export const STATUS_TONE: Record<BlogPostStatus, 'neutral' | 'warning' | 'success' | 'info'> = { DRAFT: 'neutral', IN_REVIEW: 'warning', PUBLISHED: 'success', ARCHIVED: 'info' };

/** Persian-safe slug suggestion: keep Persian letters and digits, join words with single hyphens. */
export function suggestSlug(title: string): string {
  return title.normalize('NFC').replace(/[‌‏‎]+/gu, '-').toLowerCase()
    .replace(/[^a-z0-9ء-غف-قل-وپچژکگی۰-۹]+/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '').slice(0, 120);
}

export function blogErrorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'STALE_VERSION': return 'مقاله در این فاصله تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.';
      case 'CONCURRENT_UPDATE': return 'مقاله هم‌زمان ویرایش شد؛ دوباره تلاش کنید.';
      case 'SLUG_TAKEN': return 'این نشانی (slug) برای مقالهٔ دیگری استفاده شده است.';
      case 'INVALID_MEDIA': return 'تصویر شاخص باید تصویری آماده و پردازش‌شده باشد.';
      case 'PUBLISH_BLOCKED': return error.message;
      case 'INVALID_TRANSITION': return 'این گام در وضعیت فعلی مقاله مجاز نیست.';
      case 'IDEMPOTENCY_CONFLICT': return 'این درخواست با درخواست قبلی هم‌کلید است؛ دوباره تلاش کنید.';
      case 'AUTH_REAUTHENTICATION_REQUIRED': return 'برای این عملیات، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است.';
      case 'FORBIDDEN': return 'نقش شما اجازهٔ این کار را ندارد.';
      case 'INVALID_REQUEST': return error.message || 'فیلدها ناقص یا نامعتبرند.';
    }
  }
  return 'درخواست تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید. تا زمان تأیید، مقاله ذخیره‌شده فرض نشود.';
}
