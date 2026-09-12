import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CarouselProps {
  children: ReactNode[];
  itemClassName?: string;
}

export default function Carousel({ children, itemClassName = "" }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const checkScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const scrolled = Math.abs(el.scrollLeft);
    setCanPrev(scrolled < maxScroll - 4);
    setCanNext(scrolled > 4);
  };

  useEffect(() => {
    checkScroll();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scrollByAmount = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.85, 420) * dir;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex gap-4 sm:gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 no-scrollbar"
      >
        {children.map((child, i) => (
          <div key={i} className={`snap-start shrink-0 ${itemClassName}`}>
            {child}
          </div>
        ))}
      </div>

      <button
        onClick={() => scrollByAmount(1)}
        disabled={!canPrev}
        aria-label="قبلی"
        className={`hidden sm:flex absolute -top-16 left-12 w-11 h-11 rounded-full border items-center justify-center transition-colors ${
          canPrev
            ? "bg-white/5 border-white/15 text-white hover:bg-amber-500 hover:text-[#0f1216] hover:border-amber-500"
            : "bg-white/5 border-white/5 text-stone-600 cursor-not-allowed"
        }`}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <button
        onClick={() => scrollByAmount(-1)}
        disabled={!canNext}
        aria-label="بعدی"
        className={`hidden sm:flex absolute -top-16 left-0 w-11 h-11 rounded-full border items-center justify-center transition-colors ${
          canNext
            ? "bg-white/5 border-white/15 text-white hover:bg-amber-500 hover:text-[#0f1216] hover:border-amber-500"
            : "bg-white/5 border-white/5 text-stone-600 cursor-not-allowed"
        }`}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    </div>
  );
}
