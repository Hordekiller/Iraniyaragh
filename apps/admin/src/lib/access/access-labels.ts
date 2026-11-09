import type { AccessPermission } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import type { StatusTone } from '@/components/ui/StatusChip';

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  catalog: 'کالا و رسانه',
  pricing: 'قیمت‌گذاری',
  inventory: 'موجودی و انبار',
  suppliers: 'تأمین‌کنندگان',
  purchasing: 'خرید',
  stocktake: 'انبارگردانی',
  orders: 'سفارش‌ها',
  shipments: 'ارسال',
  payments: 'پرداخت',
  invoices: 'فاکتور',
  credit: 'اعتبار و مطالبات',
  customers: 'مشتریان',
  users: 'کاربران',
  roles: 'نقش‌ها و دسترسی',
  reports: 'گزارش‌ها',
  audit: 'ممیزی',
  settings: 'تنظیمات',
};

export const PERMISSION_GROUP_ORDER = Object.keys(PERMISSION_GROUP_LABELS);

export const PERMISSION_LABELS: Record<string, string> = {
  'catalog.read': 'مشاهدهٔ کالا',
  'catalog.write': 'مدیریت کالا',
  'catalog.media.read': 'مشاهدهٔ رسانهٔ کالا',
  'catalog.media.write': 'مدیریت رسانهٔ کالا',
  'catalog.publish': 'انتشار کالا',
  'pricing.read': 'مشاهدهٔ قیمت‌ها',
  'pricing.write': 'مدیریت قیمت‌ها',
  'inventory.read': 'مشاهدهٔ موجودی',
  'inventory.adjust': 'اصلاح موجودی',
  'inventory.transfer': 'انتقال موجودی',
  'inventory.approve': 'تأیید انتقال موجودی',
  'suppliers.read': 'مشاهدهٔ تأمین‌کنندگان',
  'suppliers.manage': 'مدیریت تأمین‌کنندگان',
  'purchasing.read': 'مشاهدهٔ خریدها',
  'purchasing.manage': 'مدیریت سفارش خرید',
  'purchasing.approve': 'تأیید سفارش خرید',
  'purchasing.receive': 'دریافت سفارش خرید',
  'stocktake.read': 'مشاهدهٔ انبارگردانی',
  'stocktake.manage': 'مدیریت انبارگردانی',
  'stocktake.count': 'ثبت شمارش انبار',
  'stocktake.approve': 'تأیید انبارگردانی',
  'orders.read': 'مشاهدهٔ سفارش‌ها',
  'orders.manage': 'مدیریت سفارش‌ها',
  'shipments.read': 'مشاهدهٔ ارسال‌ها',
  'shipments.manage': 'مدیریت ارسال‌ها',
  'payments.read': 'مشاهدهٔ پرداخت‌ها',
  'payments.reconcile': 'بازبینی پرداخت‌های نامعلوم',
  'payments.refund': 'بازگرداندن پرداخت',
  'invoices.issue': 'صدور فاکتور قطعی',
  'invoices.publish': 'مدیریت نمایش فاکتور مشتری',
  'invoices.read': 'مشاهدهٔ فاکتورها و پیش‌فاکتورها',
  'invoices.manage': 'مدیریت پیش‌فاکتورها',
  'credit.approve': 'تأیید فروش اعتباری',
  'credit.read': 'مشاهدهٔ مطالبات',
  'credit.manage': 'مدیریت سیاست اعتبار',
  'credit.opening': 'ثبت ماندهٔ اولیه',
  'credit.receive': 'ثبت دریافت اعتباری',
  'credit.adjust': 'اصلاح مستندات مطالبات',
  'customers.read': 'مشاهدهٔ مشتریان',
  'customers.manage': 'مدیریت مشتریان',
  'users.manage': 'مدیریت کاربران',
  'roles.manage': 'مدیریت نقش‌ها و دسترسی',
  'reports.read': 'مشاهدهٔ گزارش‌ها',
  'reports.export': 'خروجی گزارش',
  'audit.read': 'مشاهدهٔ ممیزی',
  'settings.manage': 'مدیریت تنظیمات',
};

export const ACCESS_ACTION_LABELS: Record<string, string> = {
  'access.role.created': 'ایجاد نقش',
  'access.role.updated': 'ویرایش نقش',
  'access.role.permissions.replaced': 'تغییر دسترسی‌ها',
  'access.role.member.assigned': 'افزودن عضو',
  'access.role.member.revoked': 'حذف عضو',
};

export function permissionLabel(permission: AccessPermission): string {
  return PERMISSION_LABELS[permission.key] ?? permission.name;
}

export function permissionGroupLabel(group: string): string {
  return PERMISSION_GROUP_LABELS[group] ?? group;
}

export function roleStatusLabel(isActive: boolean): string {
  return isActive ? 'فعال' : 'غیرفعال';
}

export function roleStatusTone(isActive: boolean): StatusTone {
  return isActive ? 'success' : 'neutral';
}

export function accessActionLabel(action: string): string {
  return ACCESS_ACTION_LABELS[action] ?? action;
}

export function accessErrorMessage(failure: unknown): string {
  if (failure instanceof ApiNetworkError) {
    return 'نتیجهٔ درخواست نامشخص است. فهرست نقش‌ها را نوسازی و وضعیت را بررسی کنید.';
  }
  if (failure instanceof ApiClientError) {
    switch (failure.code) {
      case 'ACCESS_VERSION_CONFLICT':
        return 'اطلاعات دسترسی تغییر کرده است. صفحه را نوسازی و دوباره تلاش کنید.';
      case 'ACCESS_LAST_ADMIN':
        return 'حداقل یک کاربر فعال باید مجوز «مدیریت نقش‌ها و دسترسی» را داشته باشد.';
      case 'ACCESS_PRIVILEGE_ESCALATION':
        return 'نمی‌توانید دسترسی‌ای بیش از دسترسی خودتان اعطا کنید.';
      case 'ACCESS_SYSTEM_ROLE_PROTECTED':
        return 'نقش سیستمی محافظت‌شده را نمی‌توان غیرفعال یا از دسترسی مدیریت محروم کرد.';
      case 'ACCESS_ROLE_EXISTS':
        return 'نقشی با این شناسه از قبل وجود دارد.';
      case 'ACCESS_INPUT_INVALID':
        return failure.message || 'اطلاعات واردشده معتبر نیست.';
      case 'ACCESS_NOT_FOUND':
        return 'نقش یا کاربر موردنظر یافت نشد.';
      case 'ACCESS_IDEMPOTENCY_CONFLICT':
        return 'این کلید تکرارپذیری با دستور دیگری استفاده شده است.';
      case 'CONFLICT':
        return 'دستور در حال ثبت است. کمی بعد دوباره تلاش کنید.';
      case 'RETRYABLE_CONFLICT':
        return 'هم‌زمانی رخ داد؛ دوباره تلاش کنید.';
      default:
        return failure.message;
    }
  }
  return 'عملیات ناموفق بود.';
}

const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatAccessDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTimeFormatter.format(date) : '—';
}

export function formatAccessCount(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}
