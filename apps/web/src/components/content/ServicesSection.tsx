import { Link } from 'react-router-dom'
import { BadgeCheck, ChevronLeft, Headset, KeyRound, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { SECTION_IDS } from '../../lib/site-config'

type Service = {
  icon: LucideIcon
  title: string
  desc: string
  color: string
}

const services: Service[] = [
  { icon: Truck, title: 'پیگیری آنلاین سفارش', desc: 'وضعیت هر سفارش را از حساب کاربری دنبال کنید.', color: 'bg-[#FF4D00]' },
  { icon: KeyRound, title: 'ورود با پیامک', desc: 'ورود با شماره موبایل و کد یکبارمصرف پیامکی.', color: 'bg-[#0F172A]' },
  { icon: BadgeCheck, title: 'کاتالوگ زنده', desc: 'قیمت و موجودی کالاها به‌صورت زنده از فروشگاه.', color: 'bg-[#10b981]' },
  { icon: Headset, title: 'قیمت‌گذاری سمت سرور', desc: 'جمع سفارش هنگام پرداخت از سمت فروشگاه تایید می‌شود.', color: 'bg-[#0ea5e9]' },
]

export function ServicesSection() {
  return (
    <section id={SECTION_IDS.services} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8">
      <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-[20px] lg:text-[22px] text-slate-900">خدمات ایران یراق</h2>
            <p className="text-slate-500 text-[13px] mt-1">آنچه از یک فروشگاه آنلاین ابزار انتظار دارید</p>
          </div>
          <Link
            to={ROUTES.services}
            className="inline-flex items-center gap-1 h-10 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
          >
            همه خدمات
            <ChevronLeft size={15} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mt-6">
          {services.map(s => {
            const Icon = s.icon
            return (
              <div key={s.title} className="rounded-[20px] bg-slate-50 border border-slate-100 p-5 hover:bg-white hover:shadow-lg hover:border-slate-200 transition group">
                <div className={`w-12 h-12 rounded-2xl ${s.color} text-white flex items-center justify-center shadow-md group-hover:scale-105 transition`}>
                  <Icon size={22} />
                </div>
                <div className="font-black text-slate-900 mt-4 leading-none">{s.title}</div>
                <div className="text-[13px] leading-6 text-slate-500 mt-2">{s.desc}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}