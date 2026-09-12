import { ArrowLeft } from "lucide-react";
import { categories } from "../data/categories";
import { toPersianDigits } from "../lib/utils";

export default function CategoriesSection() {
  return (
    <section id="categories" className="py-20 lg:py-28 bg-[#0f1216]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-12 gap-4">
          <div>
            <span className="text-amber-500 font-bold text-sm tracking-wide">دسته‌بندی محصولات</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-2">
              هر چیزی که برای پروژه‌ات لازمه
            </h2>
          </div>
          <button className="hidden sm:flex items-center gap-2 text-stone-300 hover:text-amber-400 font-semibold text-sm transition-colors">
            همه دسته‌ها
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                className="group relative overflow-hidden rounded-2xl bg-[#181b20] border border-white/10 p-5 lg:p-6 flex flex-col items-start gap-4 hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300 text-right"
              >
                <div
                  className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center shadow-lg`}
                >
                  <Icon className="w-6 h-6 lg:w-7 lg:h-7 text-white" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-stone-100 font-bold text-sm lg:text-base mb-1">
                    {cat.title}
                  </h3>
                  <span className="text-stone-500 text-xs">
                    {toPersianDigits(cat.count)} محصول
                  </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/5 transition-colors pointer-events-none" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
