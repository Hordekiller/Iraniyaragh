import { ArrowLeft } from 'lucide-react'
import { brandStats, services } from '../../data/prototype'

export function ServicesSection() {

  return (
    <section id="services" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8">
      <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-[20px] lg:text-[22px] text-slate-900">چرا ۴۸ هزار استادکار، ایران یراق را انتخاب کرده‌اند؟</h2>
            <p className="text-slate-500 text-[13px] mt-1">خدماتی که کار شما را آسان‌تر می‌کند، نه سخت‌تر</p>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> پشتیبانی تا ۱۰ شب • حتی جمعه‌ها
          </div>
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
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-black text-slate-900">بیشتر بدانید <ArrowLeft size={14} /></div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 grid grid-cols-3 lg:grid-cols-4 gap-3 bg-[#0F172A] rounded-[20px] p-4 lg:p-5 text-white text-center">
          {brandStats.map(s => (
            <div key={s.l} className="py-1">
              <div className="font-black text-[18px] lg:text-[22px] leading-none">{s.n}</div>
              <div className="text-white/60 text-xs mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}