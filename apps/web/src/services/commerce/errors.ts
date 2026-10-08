import { AuthApiError } from '../../lib/auth/errors'

export function commerceErrorMessage(error: unknown): string {
  if (!(error instanceof AuthApiError))
    return 'عملیات انجام نشد. دوباره تلاش کنید.'
  switch (error.code) {
    case 'CUSTOMER_ACCOUNT_REQUIRED':
      return 'حساب خرید هنوز آماده نشده است. دوباره تلاش کنید.'
    case 'CUSTOMER_ACCOUNT_LINK_REQUIRED':
      return 'برای اتصال امن حساب خرید با پشتیبانی تماس بگیرید.'
    case 'AUTH_SESSION_INVALID':
    case 'AUTH_REAUTHENTICATION_REQUIRED':
      return 'نشست شما پایان یافته است. دوباره وارد شوید.'
    case 'AUTH_CSRF_INVALID':
      return 'نشست امن سبد منقضی شده است. دوباره تلاش کنید.'
    case 'RATE_LIMITED':
      return 'درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.'
    case 'UPSTREAM_UNAVAILABLE':
      return 'سرویس سبد خرید موقتاً در دسترس نیست. کمی بعد تلاش کنید.'
    case 'CART_QUANTITY_INVALID':
      return 'تعداد درخواستی با موجودی فعلی سازگار نیست. سبد را به‌روزرسانی کنید.'
    case 'SKU_NOT_FOUND':
      return 'این تنوع دیگر قابل خرید نیست.'
    case 'CART_LINE_LIMIT_EXCEEDED':
      return 'تعداد ردیف‌های سبد به سقف مجاز رسیده است.'
    case 'IDEMPOTENCY_CONFLICT':
    case 'CONFLICT':
      return 'اطلاعات تغییر کرده است. صفحه را به‌روزرسانی و دوباره بررسی کنید.'
    case 'QUOTE_CHANGED':
      return 'قیمت یا موجودی سبد تغییر کرده است. سبد را دوباره بررسی کنید.'
    case 'SHIPPING_QUOTE_CHANGED':
      return 'مهلت پیشنهاد ارسال تمام شده است. هزینه ارسال را دوباره محاسبه کنید.'
    case 'SHIPPING_UNAVAILABLE':
      return 'روش ارسال فعالی برای ثبت سفارش در دسترس نیست. با پشتیبانی فروشگاه تماس بگیرید.'
    case 'CART_EMPTY':
      return 'سبد خرید خالی است.'
    case 'NOT_FOUND':
      return 'اطلاعات درخواستی یافت نشد.'
    case 'ORDER_NOT_FOUND':
      return 'سفارش در حساب شما یافت نشد.'
    case 'ORDER_STATE_CONFLICT':
      return 'وضعیت سفارش یا مهلت رزرو موجودی تغییر کرده است. وضعیت سفارش را دوباره بررسی کنید.'
    case 'INSUFFICIENT_STOCK':
      return 'موجودی برای ثبت این سفارش کافی نیست. سبد خرید را دوباره بررسی کنید.'
    case 'NETWORK_ERROR':
      return 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید.'
    case 'TIMEOUT':
      return 'پاسخ سرور طول کشید. نتیجه را بررسی و دوباره تلاش کنید.'
    default:
      return 'عملیات انجام نشد. دوباره تلاش کنید.'
  }
}
