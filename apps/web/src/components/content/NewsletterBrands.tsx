import { brandsRow } from '../../data/prototype'
import { useToast } from '../feedback/toast-context'

export function NewsletterBrands() {
  const { show } = useToast()

  return (
    <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6">
      <div className="rounded-[24px] lg:rounded-[28px] bg-gradient-to-l from-[#FF4D00] to-[#ff7a00] p-5 lg:p-7 text-white relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -right-10 bottom-0 w-60 h-60 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <h4 className="font-black text-[18px] lg:text-[20px]">عضو باشگاه استادکاران شوید</h4>
            <p className="text-white/85 text-[13px] mt-1.5 leading-6">کد تخفیف ۱۵۰ هزار تومانی + اطلاع از حراج‌های پنهان قبل از همه</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); show('کد تخفیف ارسال شد ✓') }} className="flex w-full lg:w-auto gap-2 bg-white rounded-full p-1.5 lg:min-w-[420px]">
            <input placeholder="شماره موبایل یا ایمیل" className="flex-1 bg-transparent px-5 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none" />
            <button className="h-10 px-6 rounded-full bg-[#0F172A] text-white font-black text-sm hover:bg-black transition shrink-0">دریافت کد</button>
          </form>
        </div>
      </div>

      <div className="flex items-center gap-3 lg:gap-6 mt-6 overflow-x-auto scrollbar-none py-2">
        {brandsRow.map(b => (
          <div key={b} className="shrink-0 h-14 px-7 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black tracking-widest text-slate-400 text-sm">{b}</div>
        ))}
        <span className="shrink-0 text-white/50 text-xs font-bold mr-2">+۳۲ برند دیگر</span>
      </div>
    </section>
  )
}