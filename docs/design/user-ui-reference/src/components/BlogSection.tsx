import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { blogPosts } from "../data/blog";

export default function BlogSection() {
  return (
    <section id="blog" className="py-20 lg:py-28 bg-[#0f1216]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-12 gap-4">
          <div>
            <span className="text-amber-500 font-bold text-sm tracking-wide">وبلاگ آموزشی</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-2">
              راهنما و آموزش‌های تخصصی ابزار
            </h2>
          </div>
          <button className="hidden sm:flex items-center gap-2 text-stone-300 hover:text-amber-400 font-semibold text-sm transition-colors">
            همه مقالات
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {blogPosts.map((post) => (
            <article
              key={post.id}
              className="group bg-[#181b20] border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-amber-500 text-[#0f1216] text-xs font-bold">
                  {post.category}
                </span>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-stone-100 font-bold text-sm leading-6 mb-3 line-clamp-2 group-hover:text-amber-400 transition-colors min-h-[3rem]">
                  {post.title}
                </h3>
                <p className="text-stone-400 text-xs leading-6 mb-4 line-clamp-2 flex-1">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-4 text-[11px] text-stone-500 pt-3 border-t border-white/10">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {post.readTime}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
