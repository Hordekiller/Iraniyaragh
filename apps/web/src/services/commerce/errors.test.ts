import { describe, expect, it } from 'vitest'
import { AuthApiError } from '../../lib/auth/errors'
import { commerceErrorMessage } from './errors'

const cases = [
  ['AUTH_SESSION_INVALID', 'نشست شما پایان یافته است. دوباره وارد شوید.'],
  [
    'AUTH_REAUTHENTICATION_REQUIRED',
    'نشست شما پایان یافته است. دوباره وارد شوید.',
  ],
  [
    'CART_QUANTITY_INVALID',
    'تعداد درخواستی با موجودی فعلی سازگار نیست. سبد را به‌روزرسانی کنید.',
  ],
  ['SKU_NOT_FOUND', 'این تنوع دیگر قابل خرید نیست.'],
  ['CART_LINE_LIMIT_EXCEEDED', 'تعداد ردیف‌های سبد به سقف مجاز رسیده است.'],
  [
    'IDEMPOTENCY_CONFLICT',
    'اطلاعات تغییر کرده است. صفحه را به‌روزرسانی و دوباره بررسی کنید.',
  ],
  [
    'CONFLICT',
    'اطلاعات تغییر کرده است. صفحه را به‌روزرسانی و دوباره بررسی کنید.',
  ],
  [
    'QUOTE_CHANGED',
    'قیمت یا موجودی سبد تغییر کرده است. سبد را دوباره بررسی کنید.',
  ],
  [
    'SHIPPING_QUOTE_CHANGED',
    'مهلت پیشنهاد ارسال تمام شده است. هزینه ارسال را دوباره محاسبه کنید.',
  ],
  ['CART_EMPTY', 'سبد خرید خالی است.'],
  ['NOT_FOUND', 'اطلاعات درخواستی یافت نشد.'],
  ['NETWORK_ERROR', 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید.'],
  ['TIMEOUT', 'پاسخ سرور طول کشید. نتیجه را بررسی و دوباره تلاش کنید.'],
] as const

describe('commerceErrorMessage', () => {
  it.each(cases)(
    'maps %s to an actionable Persian message',
    (code, expected) => {
      expect(
        commerceErrorMessage(
          new AuthApiError({ code, message: 'server message' }),
        ),
      ).toBe(expected)
    },
  )

  it('does not expose unknown server or JavaScript error messages', () => {
    const safe = 'عملیات انجام نشد. دوباره تلاش کنید.'
    expect(
      commerceErrorMessage(
        new AuthApiError({ code: 'INTERNAL_ERROR', message: 'secret' }),
      ),
    ).toBe(safe)
    expect(commerceErrorMessage(new Error('secret'))).toBe(safe)
  })
})
