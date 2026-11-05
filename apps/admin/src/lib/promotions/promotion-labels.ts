import type { CouponErrorCode, PromotionKind, PromotionMode, PromotionRedemptionStatus, PromotionState } from '@iranyaragh/contracts';
import type { StatusTone } from '@/components/ui/StatusChip';

export const KIND_LABELS: Record<PromotionKind, string> = {
  PERCENTAGE: 'تخفیف درصدی',
  FIXED_CART: 'تخفیف مبلغ ثابت روی سبد',
  FIXED_ITEM: 'تخفیف مبلغ ثابت برای هر واحد کالا',
  FREE_SHIPPING: 'ارسال رایگان',
};
export const MODE_LABELS: Record<PromotionMode, string> = { COUPON: 'با کد تخفیف', AUTOMATIC: 'خودکار (بدون کد)' };
export const STATE_LABELS: Record<PromotionState, string> = {
  ACTIVE: 'فعال', INACTIVE: 'غیرفعال', SCHEDULED: 'زمان‌بندی‌شده', EXPIRED: 'منقضی', EXHAUSTED: 'ظرفیت تکمیل',
};
export const STATE_TONES: Record<PromotionState, StatusTone> = {
  ACTIVE: 'success', INACTIVE: 'neutral', SCHEDULED: 'info', EXPIRED: 'warning', EXHAUSTED: 'warning',
};
export const REDEMPTION_LABELS: Record<PromotionRedemptionStatus, string> = {
  RESERVED: 'رزرو (در انتظار پرداخت)', CONFIRMED: 'قطعی (پرداخت‌شده)', RELEASED: 'لغو/منقضی', REFUNDED: 'بازپرداخت کامل',
};
export const REDEMPTION_TONES: Record<PromotionRedemptionStatus, StatusTone> = {
  RESERVED: 'info', CONFIRMED: 'success', RELEASED: 'neutral', REFUNDED: 'warning',
};

const FA = '۰۱۲۳۴۵۶۷۸۹';
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹]/gu, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/gu, (d) => String(d.charCodeAt(0) - 0x0660));
}
export function formatIrr(amount: string): string {
  return `${BigInt(amount).toLocaleString('fa-IR')} ریال`;
}
export function percentLabel(bp: number | null): string {
  return bp === null ? '' : `${(bp / 100).toLocaleString('fa-IR')}٪`;
}
export const COUPON_ERROR_LABELS: Record<CouponErrorCode, string> = {
  COUPON_NOT_FOUND: 'کد تخفیف معتبر نیست.', COUPON_INACTIVE: 'کد تخفیف غیرفعال است.', COUPON_NOT_STARTED: 'هنوز شروع نشده است.',
  COUPON_EXPIRED: 'مهلت کد تخفیف تمام شده است.', COUPON_EXHAUSTED: 'ظرفیت کد تخفیف تکمیل شده است.',
  COUPON_CUSTOMER_LIMIT: 'سقف استفادهٔ مشتری تکمیل شده است.', COUPON_NOT_ELIGIBLE: 'مشتری مجاز به استفاده نیست.', COUPON_NOT_APPLICABLE: 'برای سبد فعلی قابل اعمال نیست.',
};
