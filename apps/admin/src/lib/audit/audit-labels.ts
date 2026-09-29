import type { AuditLogEntry } from '@iranyaragh/contracts';

export const entityTypeLabels: Record<string, string> = {
  order: 'سفارش',
  payment: 'پرداخت',
  shipment: 'ارسال',
  fulfillment: 'تکمیل سفارش',
  stocktake: 'انبارگردانی',
  supplier: 'تأمین‌کننده',
  inventory: 'انبار',
  catalog: 'کالا و فهرست',
  auth: 'نشست و احراز هویت',
};

export const actionLabels: Record<string, string> = {
  'auth.admin.bootstrapped': 'راه‌اندازی نخستین مدیر',
  'auth.otp.failed': 'کد ورود ناموفق',
  'auth.otp.requested': 'درخواست کد ورود',
  'auth.otp.verified': 'ورود با کد تأیید انجام شد',
  'auth.password.changed': 'تغییر گذرواژه',
  'auth.permission.denied': 'رد دسترسی',
  'auth.session.created': 'ایجاد نشست',
  'auth.session.revoked': 'ابطال نشست',
  'auth.session.rotated': 'چرخش نشست',
  'auth.totp.enrolled': 'فعال‌سازی ورود دومرحله‌ای',
  'cart.guest.merged': 'ادغام سبد خرید مهمان',
  'catalog.attribute.created': 'ایجاد مشخصه',
  'catalog.attribute.option.created': 'ایجاد مقدار مشخصه',
  'catalog.attribute.option.updated': 'ویرایش مقدار مشخصه',
  'catalog.attribute.updated': 'ویرایش مشخصه',
  'catalog.brand.created': 'ایجاد برند',
  'catalog.brand.updated': 'ویرایش برند',
  'catalog.category.created': 'ایجاد دسته',
  'catalog.category.updated': 'ویرایش دسته',
  'catalog.import.committed': 'اعمال نهایی ایمپورت',
  'catalog.import.uploaded': 'بارگذاری ایمپورت',
  'catalog.product.created': 'ایجاد کالا',
  'catalog.variant.updated': 'ویرایش رنگ‌بندی',
  create: 'ایجاد',
  dispatch: 'ارسال',
  'fulfillment.item.picked': 'برداشت اقلام',
  'fulfillment.start': 'شروع تکمیل سفارش',
  'inventory.balance.changed': 'تغییر موجودی',
  'inventory.location.created': 'ایجاد مکان',
  'inventory.reservation.consumed': 'مصرف رزرو',
  'inventory.reservation.released': 'آزادسازی رزرو',
  'inventory.transfer.created': 'ایجاد انتقال',
  'inventory.transfer.dispatched': 'ارسال انتقال',
  'inventory.warehouse.created': 'ایجاد انبار',
  'inventory.warehouse.updated': 'ویرایش انبار',
  'order.cancelled': 'لغو سفارش',
  'order.expired': 'انقضای سفارش',
  'order.paid': 'پرداخت سفارش',
  'outbox.replay.rejected': 'بازپخش رد شد',
  'outbox.replay.requested': 'درخواست بازپخش',
  'payment.failed': 'پرداخت ناموفق',
  'payment.paid': 'پرداخت موفق',
  'payment.reconciliation.requested': 'درخواست تطبیق پرداخت',
  'payment.refund.recorded': 'ثبت بازگشت وجه',
  'payment.verification.unconfirmed': 'پرداخت بدون تأیید',
  publish: 'انتشار',
  'shipment.delivery.confirm': 'تأیید تحویل ارسال',
  'shipment.dispatch': 'ارسال بسته',
  'stocktake.approved': 'تأیید انبارگردانی',
  'stocktake.cancelled': 'لغو انبارگردانی',
  'stocktake.counted': 'ثبت شمارش',
  'stocktake.created': 'ایجاد انبارگردانی',
  'stocktake.started': 'شروع انبارگردانی',
  'stocktake.submitted': 'ارسال برای بازبینی',
  'supplier.created': 'ایجاد تأمین‌کننده',
  'supplier.updated': 'ویرایش تأمین‌کننده',
  unpublish: 'خروج از انتشار',
};

export function entityTypeLabel(value: string | null): string {
  if (!value) return '—';
  return entityTypeLabels[value] ?? value;
}

export function actionLabel(value: string): string {
  const known = actionLabels[value];
  if (known) return known;
  const prefix = value.split('.')[0];
  const prefixLabel = entityTypeLabels[prefix] ?? prefix;
  return `${value} (${prefixLabel})`;
}

export function describeAuditChange(entry: AuditLogEntry): string {
  const subject = entityTypeLabel(entry.entityType);
  if (entry.action.startsWith('auth.')) return actionLabel(entry.action);
  if (entry.action.includes('.created') || entry.action === 'create') return `ایجاد ${subject}`;
  if (entry.action.includes('.updated') || entry.action === 'update') return `ویرایش ${subject}`;
  return actionLabel(entry.action);
}