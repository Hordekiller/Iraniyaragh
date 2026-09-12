import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ArrowLeft, Zap } from "lucide-react";

const slides = [
  {
    id: 1,
    image: "/images/hero/hero1.jpg",
    tag: "کالکشن جدید",
    title: "هر ابزاری که نیاز داری، یک‌جا",
    subtitle: "بیش از ۵۰۰۰ محصول اصل با گارانتی معتبر و ارسال سریع به سراسر کشور",
    cta: "مشاهده محصولات",
  },
  {
    id: 2,
    image: "/images/hero/hero2.jpg",
    tag: "پیشنهاد ویژه",
    title: "تا ۴۰٪ تخفیف روی ابزار برقی",
    subtitle: "دریل، فرز، اره و کمپرسور از برندهای معتبر با بهترین قیمت بازار",
    cta: "مشاهده تخفیف‌ها",
  },
  {
    id: 3,
    image: "/images/hero/hero3.jpg",
    tag: "کیفیت حرفه‌ای",
    title: "ابزار دستی، دقیق و ماندگار",
    subtitle: "انتخاب حرفه‌ای‌ها برای کارگاه، تعمیرگاه و پروژه‌های ساختمانی",
    cta: "بیشتر بدانید",
  },
];

export default function HeroSlider() {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => setIndex((i) => (i + 1) % slides.length), []);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + slides.length) % slides.length),
    []
  );

  useEffect(() => {
    const t = setInterval(next, 5500);
    return () => clearInterval(t);
  }, [next]);

  return (
    <section
      id="home"
      className="relative w-full h-[92vh] sm:h-[85vh] lg:h-[90vh] max-h-[820px] min-h-[560px] overflow-hidden bg-[#0f1216]"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === index ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        >
          <img
            src={slide.image}
            alt={slide.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f1216] via-[#0f1216]/70 to-[#0f1216]/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f1216]/90 via-[#0f1216]/40 to-transparent" />

          <div className="relative h-full max-w-7xl mx-auto px-6 flex items-center">
            <div
              className={`max-w-xl transition-all duration-700 delay-150 ${
                i === index ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold mb-5">
                <Zap className="w-3.5 h-3.5" />
                {slide.tag}
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black text-white leading-[1.25] mb-5">
                {slide.title}
              </h1>
              <p className="text-stone-300 text-base lg:text-lg leading-8 mb-8 max-w-md">
                {slide.subtitle}
              </p>
              <div className="flex items-center gap-4">
                <button className="group flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-l from-amber-500 to-orange-600 text-[#0f1216] font-bold shadow-lg shadow-amber-900/40 hover:brightness-110 transition-all">
                  {slide.cta}
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
                <button className="px-6 py-3.5 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/10 transition-colors backdrop-blur-sm">
                  تماس با ما
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* controls */}
      <button
        onClick={prev}
        aria-label="قبلی"
        className="absolute z-20 top-1/2 -translate-y-1/2 right-4 lg:right-8 w-11 h-11 rounded-full bg-black/30 border border-white/15 backdrop-blur-md text-white flex items-center justify-center hover:bg-amber-500 hover:text-[#0f1216] transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <button
        onClick={next}
        aria-label="بعدی"
        className="absolute z-20 top-1/2 -translate-y-1/2 left-4 lg:left-8 w-11 h-11 rounded-full bg-black/30 border border-white/15 backdrop-blur-md text-white flex items-center justify-center hover:bg-amber-500 hover:text-[#0f1216] transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* dots */}
      <div className="absolute z-20 bottom-8 sm:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            aria-label={`اسلاید ${i + 1}`}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-8 bg-amber-500" : "w-2 bg-white/40 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
