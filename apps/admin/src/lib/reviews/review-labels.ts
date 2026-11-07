import type { ProductReviewStatus } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';

export const REVIEW_STATUS_LABEL: Record<ProductReviewStatus, string> = { PENDING: 'در انتظار بررسی', APPROVED: 'منتشرشده', REJECTED: 'ردشده', HIDDEN: 'پنهان' };
export const REVIEW_STATUS_TONE: Record<ProductReviewStatus, 'neutral' | 'warning' | 'success' | 'info' | 'error'> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error', HIDDEN: 'neutral' };

export function reviewErrorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'STALE_VERSION': return 'نظر در این فاصله تغییر کرده است (مثلاً مشتری آن را ویرایش کرد)؛ فهرست را دوباره بارگذاری کنید.';
      case 'CONCURRENT_UPDATE': return 'نظر هم‌زمان تغییر کرد؛ دوباره تلاش کنید.';
      case 'INVALID_TRANSITION': return 'این گام در وضعیت فعلی نظر مجاز نیست.';
      case 'IDEMPOTENCY_CONFLICT': return 'این درخواست با درخواست قبلی هم‌کلید است؛ دوباره تلاش کنید.';
      case 'AUTH_REAUTHENTICATION_REQUIRED': return 'برای این عملیات، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است.';
      case 'FORBIDDEN': return 'نقش شما اجازهٔ این کار را ندارد.';
      case 'VALIDATION_ERROR': return error.message || 'فیلدها نامعتبرند.';
    }
  }
  return 'درخواست تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید. تا زمان تأیید، تغییری اعمال‌شده فرض نشود.';
}
