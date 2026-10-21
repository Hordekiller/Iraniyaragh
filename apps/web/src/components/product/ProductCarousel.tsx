import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductCard } from "./ProductCard";
import type { CatalogProduct } from "../../services/catalog/types";

type ProductCarouselProps = {
  id: string;
  title: string;
  description?: string;
  products: CatalogProduct[];
  moreHref: string;
};

export function ProductCarousel({
  id,
  title,
  description,
  products,
  moreHref,
}: ProductCarouselProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const scroll = (direction: "previous" | "next") => {
    const list = listRef.current;
    if (!list) return;
    const rtl =
      list.dir === "rtl" || getComputedStyle(list).direction === "rtl";
    const sign = direction === "next" ? (rtl ? -1 : 1) : rtl ? 1 : -1;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    list.scrollBy({
      left: sign * Math.round(list.clientWidth * 0.8),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <section className="mt-10 lg:mt-14" aria-labelledby={`${id}-title`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#C2410C]">ایران یراق</p>
          <h2
            id={`${id}-title`}
            className="mt-1 text-xl font-black text-slate-900 lg:text-2xl"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 text-sm text-slate-600">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={moreHref}
            className="rounded-xl px-3 py-2 text-xs font-bold text-[#9A3412] hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] sm:text-sm"
          >
            مشاهده همه
          </Link>
          <button
            type="button"
            onClick={() => scroll("previous")}
            aria-label={`کالاهای قبلی در ${title}`}
            className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-orange-300 hover:text-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] lg:size-10"
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scroll("next")}
            aria-label={`کالاهای بعدی در ${title}`}
            className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-orange-300 hover:text-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] lg:size-10"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul
        id={`${id}-list`}
        ref={listRef}
        dir="rtl"
        tabIndex={0}
        aria-label={`فهرست ${title}; برای پیمایش افقی از کلیدهای جهت‌دار استفاده کنید`}
        className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-1 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] sm:gap-4"
      >
        {products.length === 0 ? (
          <li className="w-full shrink-0 snap-start rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            هنوز محصول منتشرشده‌ای در این دسته نیست. پس از تکمیل و انتشار کالاها، آن‌ها در این بخش نمایش داده می‌شوند.
          </li>
        ) : products.map((product) => (
          <li
            key={product.id}
            className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-[calc(25%-12px)]"
          >
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
