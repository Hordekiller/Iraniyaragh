import { ArrowLeft, ArrowUpLeft } from 'lucide-react'
import { categories } from '../../data/prototype'
import { useToast } from '../feedback/toast-context'

export function CategoryGrid() {
  const { show } = useToast()

  return (
    <section id="categories" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 lg:mt-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-widest text-[#FF4D00]">CATEGORIES <span className="w-8 h-px bg-[#FF4D00]" /></div>
          <h2 className="text-[22px] lg:text-[28px] font-black text-white leading-none mt-2">دسته‌بندی تخصصی ابزار</h2>
          <p className="text-white/60 text-[13px] mt-2">هر آنچه یک استادکار حرفه‌ای نیاز دارد، یک‌جا</p>
        </div>
        <button onClick={() => show('مشاهده همه دسته‌ها')} className="hidden lg:flex items-center gap-2 h-10 px-5 rounded-full bg-white text-slate-900 font-bold text-sm hover:bg-slate-50 transition">همه دسته‌ها <ArrowLeft size={16} /></button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4 mt-6">
        {categories.map(cat => {
          const Icon = cat.icon
          return (
            <button key={cat.id} onClick={() => show(`ورود به ${cat.title}`)} className="group relative overflow-hidden rounded-[20px] lg:rounded-[24px] bg-white p-4 lg:p-5 text-right hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1 border border-white">
              <div className={`absolute -left-6 -top-6 w-24 h-24 rounded-full ${cat.color} opacity-[0.08] group-hover:opacity-[0.14] transition`} />
              <div className={`w-12 h-12 rounded-2xl ${cat.color} text-white flex items-center justify-center shadow-lg`}>
                <Icon size={22} />
              </div>
              <div className="mt-3 lg:mt-4 font-black text-slate-900 text-[14px] lg:text-[15px] leading-none">{cat.title}</div>
              <div className="text-[11px] text-slate-400 font-bold tracking-widest mt-1">{cat.en}</div>
              <div className="inline-flex mt-3 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[11px] font-bold">{cat.count}</div>
              <div className="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-[#FF4D00] group-hover:text-white group-hover:border-[#FF4D00] transition">
                <ArrowUpLeft size={16} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}