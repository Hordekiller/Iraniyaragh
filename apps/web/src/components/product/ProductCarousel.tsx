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
  /** `offer` is the visually distinct special-offers treatment. */
  variant?: "default" | "offer";
  status?: "ready" | "loading" | "error";
  onRetry?: () => void;
};

export function ProductCarousel({
  id,
  title,
  description,
  products,
  moreHref,
  variant = "default",
  status = "ready",
  onRetry,
}: ProductCarouselProps) {
  const offer = variant === "offer";
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
    <section
      className={`mt-10 lg:mt-14 ${offer ? "rounded-3xl bg-gradient-to-l from-[#9A3412] to-[#C2410C] p-4 text-white sm:p-6" : ""}`}
      aria-labelledby={`${id}-title`}
      aria-busy={status === "loading"}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-xs font-bold ${offer ? "text-orange-100" : "text-[#C2410C]"}`}
          >
            ایرانی یراق
          </p>
          <h2
            id={`${id}-title`}
            className={`mt-1 text-xl font-black lg:text-2xl ${offer ? "text-white" : "text-slate-900"}`}
          >
            {title}
          </h2>
          {description && (
            <p
              className={`mt-1.5 text-sm ${offer ? "text-orange-50" : "text-slate-600"}`}
            >
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={moreHref}
            className={`rounded-xl px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] sm:text-sm ${offer ? "bg-white text-[#9A3412] hover:bg-orange-50" : "text-[#9A3412] hover:bg-orange-50"}`}
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
      {status === "loading" ? (
        <div
          className="mt-5 flex gap-3 overflow-hidden sm:gap-4"
          role="status"
          aria-label="در حال دریافت کالاها"
        >
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-72 w-[72%] shrink-0 animate-pulse rounded-[20px] bg-slate-100 motion-reduce:animate-none sm:w-[42%] lg:w-[calc(25%-12px)]"
            />
          ))}
        </div>
      ) : status === "error" ? (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>کالاهای این بخش دریافت نشدند.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-lg bg-red-800 px-3 py-1.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2"
            >
              تلاش دوباره
            </button>
          )}
        </div>
      ) : products.length === 0 ? (
        <p className="mt-5 text-sm text-slate-600">
          هنوز کالایی در این بخش منتشر نشده است.
        </p>
      ) : (
        <ul
          id={`${id}-list`}
          ref={listRef}
          dir="rtl"
          tabIndex={0}
          aria-label={`فهرست ${title}; برای پیمایش افقی از کلیدهای جهت‌دار استفاده کنید`}
          className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-1 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] sm:gap-4"
        >
          {products.map((product) => (
            <li
              key={product.id}
              className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-[calc(25%-12px)]"
            >
              <ProductCard product={product} variant={variant} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
