import { ArrowLeft, Clock3 } from 'lucide-react'
import { blogPosts } from '../../data/prototype'
import { useToast } from '../feedback/toast-context'

export function BlogSection() {
  const { show } = useToast()

  return (
    <section id="blog" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-widest text-white/70">MAGAZINE <span className="w-8 h-px bg-white/30" /></div>
          <h2 className="text-[22px] lg:text-[28px] font-black text-white leading-none mt-2">مجله آموزشی ایران یراق</h2>
          <p className="text-white/60 text-[13px] mt-2">هر هفته، ترفندهای کارگاهی که پول شما را ذخیره می‌کند</p>
        </div>
        <button onClick={() => show('ورود به مجله')} className="hidden lg:flex h-10 px-5 rounded-full bg-white text-slate-900 font-bold text-sm">همه مقالات <ArrowLeft size={16} className="mr-2" /></button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 lg:gap-5 mt-6">
        {blogPosts.map(post => (
          <button key={post.id} type="button" onClick={() => show(`مقاله: ${post.title}`)} className="group bg-white rounded-[22px] overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer text-right">
            <div className="relative h-[184px] overflow-hidden">
              <img src={post.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
              <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold">{post.tag}</span>
              <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-slate-900 text-xs font-bold flex items-center gap-1"><Clock3 size={12} /> {post.read}</span>
            </div>
            <div className="p-4 lg:p-5">
              <div className="text-xs text-slate-500 font-medium">{post.date} • {post.read} مطالعه</div>
              <h3 className="font-black text-[15px] leading-6 text-slate-900 mt-1.5 line-clamp-2 group-hover:text-[#FF4D00] transition">{post.title}</h3>
              <p className="text-[13px] leading-6 text-slate-500 mt-2 line-clamp-2">{post.excerpt}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-black text-[#0F172A] group-hover:gap-2.5 transition-all">ادامه مطلب <ArrowLeft size={16} className="bg-slate-900 text-white rounded-full p-0.5" /></div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}