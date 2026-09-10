import { Clock3 } from 'lucide-react'
import { blogPosts } from '../../data/prototype'
import { SECTION_IDS } from '../../lib/site-config'

export function BlogSection() {
  return (
    <section id={SECTION_IDS.blog} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8">
      <div className="bg-[#0F172A] rounded-[24px] lg:rounded-[28px] p-5 lg:p-8">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-widest text-white/70">MAGAZINE <span className="w-8 h-px bg-white/30" /></div>
          <h2 className="text-[22px] lg:text-[28px] font-black text-white leading-none mt-2">مجله آموزشی ایران یراق</h2>
          <p className="text-white/60 text-[13px] mt-2">هر هفته، ترفندهای کارگاهی که پول شما را ذخیره می‌کند</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 lg:gap-5 mt-6">
          {blogPosts.map(post => (
            <article key={post.id} className="bg-white rounded-[22px] overflow-hidden text-right shadow-lg shadow-black/20">
              <div className="relative h-[184px] overflow-hidden">
                <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold">{post.tag}</span>
                <span className={`absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-slate-900 text-xs font-bold flex items-center gap-1`}><Clock3 size={12} /> {post.read}</span>
              </div>
              <div className="p-4 lg:p-5">
                <div className="text-xs text-slate-500 font-medium">{post.date} • {post.read} مطالعه</div>
                <h3 className="font-black text-[15px] leading-6 text-slate-900 mt-1.5 line-clamp-2">{post.title}</h3>
                <p className="text-[13px] leading-6 text-slate-500 mt-2 line-clamp-2">{post.excerpt}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}