import { CheckCircle2, Users, Package, Award, Clock } from "lucide-react";
import { toPersianDigits } from "../lib/utils";

const stats = [
  { icon: Clock, value: "۱۵", label: "سال تجربه" },
  { icon: Package, value: "۵۰۰۰+", label: "محصول متنوع" },
  { icon: Users, value: "۸۰۰۰۰+", label: "مشتری راضی" },
  { icon: Award, value: "۱۲", label: "شعبه فعال" },
];

const points = [
  "تضمین اصالت تمامی محصولات با کد رهگیری",
  "همکاری مستقیم با برندهای معتبر داخلی و خارجی",
  "تیم فنی متخصص برای مشاوره پیش از خرید",
  "امکان بازگشت کالا تا ۷ روز کاری",
];

export default function AboutSection() {
  return (
    <section id="about" className="py-20 lg:py-28 bg-[#14181d] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="relative order-2 lg:order-1">
            <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
              <img
                src="/images/about/workshop.jpg"
                alt="فروشگاه ابزارپرو"
                className="w-full h-[340px] sm:h-[420px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f1216]/80 via-transparent to-transparent" />
            </div>
            <div className="hidden sm:flex absolute -bottom-8 -left-4 lg:-left-8 items-center gap-4 bg-[#181b20] border border-white/10 rounded-2xl p-5 shadow-2xl">
              <img
                src="/images/about/worker.jpg"
                alt="کارشناس فروش"
                className="w-16 h-16 rounded-xl object-cover"
              />
              <div>
                <p className="text-white font-bold text-sm">تیم متخصص و مجرب</p>
                <p className="text-stone-400 text-xs mt-1">آماده مشاوره رایگان</p>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <span className="text-amber-500 font-bold text-sm tracking-wide">درباره ابزارپرو</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-2 mb-5 leading-relaxed">
              همراه شما برای ساختن، ساخته شدن و تعمیر
            </h2>
            <p className="text-stone-400 leading-8 mb-8">
              ابزارپرو از سال ۱۳۸۸ با هدف عرضه ابزار باکیفیت و اصل به صنعتگران، تعمیرکاران و
              علاقه‌مندان به کار با ابزار فعالیت خود را آغاز کرد. امروز با بیش از پنج هزار محصول
              متنوع در دسته‌های ابزار برقی، دستی، ایمنی و اندازه‌گیری، در کنار شما هستیم.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 mb-10">
              {points.map((point) => (
                <div key={point} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-stone-300 text-sm leading-6">{point}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="bg-[#181b20] border border-white/10 rounded-xl p-4 text-center"
                  >
                    <Icon className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                    <p className="text-white font-black text-lg">{toPersianDigits(stat.value)}</p>
                    <p className="text-stone-500 text-[11px] mt-1">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
