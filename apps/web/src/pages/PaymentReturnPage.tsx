import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { ROUTES } from '../lib/routes'

/** Shown only when the API cannot safely identify or verify a gateway return. */
export function PaymentReturnPage() {
  return (
    <section className="mx-auto max-w-[620px] px-4 py-20 text-center" aria-labelledby="payment-return-title">
      <ShieldAlert size={36} className="mx-auto text-amber-700" aria-hidden="true" />
      <h1 id="payment-return-title" className="mt-5 text-2xl font-black text-slate-950">
        نتیجهٔ پرداخت هنوز تأیید نشده است
      </h1>
      <p className="mt-4 text-sm leading-7 text-slate-600">
        بازگشت از درگاه به‌تنهایی نشانهٔ پرداخت موفق نیست. وضعیت سفارش‌های خود را از سرور بررسی کنید؛
        اگر مبلغی از حساب شما کسر شده ولی سفارش پرداخت‌شده نیست، با پشتیبانی تماس بگیرید.
      </p>
      <Link
        to={ROUTES.orders}
        className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-6 font-black text-white hover:bg-black"
      >
        مشاهده سفارش‌ها
      </Link>
    </section>
  )
}
