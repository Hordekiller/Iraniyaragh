import { Link } from 'react-router-dom'
import { BadgeCheck, Headset, KeyRound, PackageSearch, Truck } from 'lucide-react'
import { useDocumentMeta } from '../lib/use-document-meta'
import { ROUTES } from '../lib/routes'

/**
 * Real destination for the "services" navigation entry.
 *
 * Each card names a capability the storefront actually has, and every card links
 * to the page that performs it — no marketing claim without a destination.
 */
const services = [
  {
    icon: Truck,
    title: 'پیگیری آنلاین سفارش',
    desc: 'وضعیت هر سفارش را از حساب کاربری و صفحهٔ پیگیری سفارش دنبال کنید.',
    action: 'پیگیری سفارش',
    to: ROUTES.orders,
  },
  {
    icon: KeyRound,
    title: 'ورود با پیمک',
    desc: 'ورود با شماره موبایل و کد یکبارمصرف پیامکی، بدون رمز عبور.',
    action: 'ورود به حساب',
    to: ROUTES.account,
  },
  {
    icon: BadgeCheck,
    title: 'کاتالوگ زنده',
    desc: 'قیمت و موجودی کالاها مستقیماً از فروشگاه نمایش داده می‌شود.',
    action: 'مشاهده کاتالوگ',
    to: ROUTES.products,
  },
  {
    icon: Headset,
    title: 'قیمت‌گذاری سمت سرور',
    desc: 'جمع سفارش در مرحلهٔ پرداخت، توسط فروشگاه دوباره محاسبه و تایید می‌شود.',
    action: 'مشاهده سبد خرید',
    to: ROUTES.cart,
  },
] as const

const faq = [
  {
    question: 'قیمت‌ها چگونه تعیین می‌شوند؟',
    answer: 'قیمت هر کالا از فروشگاه خوانده می‌شود و در مرحلهٔ پرداخت، جمع سفارش توسط فروشگاه محاسبه می‌شود؛ مبلغ نهایی همان چیزی است که پرداخت می‌کنید.',
  },
  {
    question: 'موجودی کالاها چطور نمایش داده می‌شود؟',
    answer: 'وضعیت موجودی هر کالا به‌صورت زنده از فروشگاه خوانده می‌شود؛ اگر کالایی موجود نباشد، امکان افزودن آن به سبد خرید وجود ندارد.',
  },
  {
    question: 'بعد از ثبت سفارش چه اتفاقی می‌افتد؟',
    answer: 'سفارش در حساب کاربری ثبت می‌شود و وضعیت آن از همان صفحه قابل پیگیری است.',
  },
] as const

export function ServicesPage() {
  useDocumentMeta({
    title: 'خدمات فروشگاه',
    description: 'خدمات فروشگاه ایران یراق: پیگیری آنلاین سفارش، ورود با پیامک، کاتالوگ زنده و قیمت‌گذاری سمت سرور.',
    canonicalPath: ROUTES.services,
  })

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <h1 className="font-black text-slate-900 text-lg lg:text-2xl">خدمات فروشگاه</h1>
      <p className="mt-2 text-slate-500 text-[13px] lg:text-sm max-w-2xl">
        آنچه در خرید از این فروشگاه در اختیار دارید؛ هر خدمت به صفحه‌ای لینک دارد که آن را انجام می‌دهد.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {services.map(service => {
          const Icon = service.icon
          return (
            <div
              key={service.title}
              className="rounded-[20px] bg-white border border-slate-100 p-5 hover:shadow-lg hover:border-slate-200 transition"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FF4D00] text-white flex items-center justify-center shadow-md">
                <Icon size={22} aria-hidden="true" />
              </div>
              <h2 className="font-black text-slate-900 mt-4 leading-tight">{service.title}</h2>
              <p className="text-[13px] leading-6 text-slate-500 mt-2">{service.desc}</p>
              <Link
                to={service.to}
                className="inline-flex items-center gap-1 mt-4 text-xs font-bold text-[#C2410C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] rounded"
              >
                <PackageSearch size={14} aria-hidden="true" />
                {service.action}
              </Link>
            </div>
          )
        })}
      </div>

      <section aria-labelledby="services-faq" className="mt-8 bg-white rounded-[24px] p-4 lg:p-8 border border-slate-100">
        <h2 id="services-faq" className="font-black text-[20px] lg:text-[22px] text-slate-900">پرسش‌های متداول</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {faq.map(item => (
            <div key={item.question} className="py-4">
              <h3 className="font-bold text-slate-900 text-sm">{item.question}</h3>
              <p className="text-[13px] leading-7 text-slate-500 mt-2">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold">
        <Link to={ROUTES.products} className="rounded-xl bg-[#C2410C] text-white px-4 py-2.5 hover:bg-[#9A3412] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">
          مشاهده همه کالاها
        </Link>
        <Link to={ROUTES.categories} className="rounded-xl border border-slate-200 bg-white text-slate-700 px-4 py-2.5 hover:border-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">
          مرور دسته‌بندی‌ها
        </Link>
      </div>
    </div>
  )
}
