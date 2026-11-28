import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ProductGrid } from "../components/product/ProductGrid";
import { useCatalogApi } from "../state/catalog-context";
import { toPersianDigits } from "../lib/format";
import { ROUTES } from "../lib/routes";
import type {
  CatalogCategory,
  CatalogListResult,
  CatalogQuery,
} from "../services/catalog/types";

type SortKey = NonNullable<CatalogQuery["sortBy"]>;
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "جدیدترین" },
  { value: "popular", label: "پرفروش‌ترین" },
  { value: "price_asc", label: "ارزان‌ترین" },
  { value: "price_desc", label: "گران‌ترین" },
];
const PAGE_SIZE = 24;

export function SearchPage() {
  const api = useCatalogApi();
  const [params, setParams] = useSearchParams();
  const term = (params.get("q") ?? "").trim();
  const categoryId = params.get("category") ?? "";
  const sortBy =
    SORT_OPTIONS.find((option) => option.value === params.get("sort"))?.value ??
    "newest";
  const available = params.get("available") === "1";
  const discounted = params.get("discounted") === "1";
  const pageNumber = Number(params.get("page"));
  const page =
    Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const [searchInput, setSearchInput] = useState({ term, draft: term });
  if (searchInput.term !== term) setSearchInput({ term, draft: term });
  const draft = searchInput.term === term ? searchInput.draft : term;
  const setDraft = (value: string) => setSearchInput({ term, draft: value });
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [response, setResponse] = useState<{
    key: string;
    result: CatalogListResult | null;
    error: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([
    term,
    categoryId,
    sortBy,
    available,
    discounted,
    page,
    retry,
  ]);

  useEffect(() => {
    let cancelled = false;
    api
      .listCategories()
      .then((items) => {
        if (!cancelled) setCategories(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    api
      .listProducts({
        search: term,
        ...(categoryId ? { categoryId } : {}),
        sortBy,
        available,
        discounted,
        page,
        perPage: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) setResponse({ key, result, error: false });
      })
      .catch(() => {
        if (!cancelled) setResponse({ key, result: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [api, term, categoryId, sortBy, available, discounted, page, retry, key]);

  const result = response?.key === key ? response.result : null;
  const error = response?.key === key && response.error;
  const roots = categories
    .filter(
      (category) => category.parentId === null && category.productCount > 0,
    )
    .sort(
      (a, b) =>
        (a.shopOrder ?? 9999) - (b.shopOrder ?? 9999) ||
        a.name.localeCompare(b.name, "fa"),
    );

  function updateParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    setParams(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTerm = draft.trim();
    if (nextTerm) setParams({ q: nextTerm });
  }
  function movePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next);
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6 lg:py-8">
      <nav
        aria-label="مسیر صفحه"
        className="mb-4 flex items-center gap-2 text-xs text-slate-500"
      >
        <Link
          to={ROUTES.home}
          className="inline-flex min-h-11 items-center hover:text-orange-800"
        >
          خانه
        </Link>
        <ChevronLeft size={14} aria-hidden="true" />
        <span aria-current="page" className="font-bold text-slate-700">
          جستجوی کالا
        </span>
      </nav>
      <section
        aria-labelledby="search-title"
        className="relative isolate overflow-hidden rounded-[28px] bg-slate-950 p-5 text-white sm:p-8 lg:px-10 lg:py-9"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-24 -z-10 size-72 rounded-full border-[44px] border-white/5"
        />
        <p className="flex items-center gap-2 text-xs font-bold text-orange-200">
          <Search size={17} aria-hidden="true" /> جستجو در فروشگاه ایرانی یراق
        </p>
        <h1
          id="search-title"
          className="mt-3 text-2xl font-black leading-tight sm:text-3xl"
        >
          محصول موردنظرتان را سریع پیدا کنید
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300">
          نام کالا یا مدل آن را بنویسید؛ سپس نتایج را بر اساس دسته‌بندی، موجودی
          و قیمت مرتب کنید.
        </p>
        <form
          onSubmit={submit}
          role="search"
          className="mt-6 flex max-w-3xl flex-col gap-2 sm:flex-row"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              size={20}
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={150}
              aria-label="نام یا مدل کالا"
              placeholder="مثلاً دستگیره کابینت یا مدل کالا…"
              className="h-14 w-full rounded-2xl border border-white/20 bg-white pr-12 pl-11 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            />
            {draft && (
              <button
                type="button"
                onClick={() => setDraft("")}
                aria-label="پاک کردن عبارت جستجو"
                className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-14 rounded-2xl bg-[#FF4D00] px-7 text-sm font-black text-white hover:bg-[#C2410C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          >
            جستجوی کالا
          </button>
        </form>
      </section>

      {!term ? (
        <section aria-labelledby="browse-title" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="browse-title"
                className="text-lg font-black text-slate-900"
              >
                از دسته‌بندی‌ها شروع کنید
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                اگر نام دقیق کالا را نمی‌دانید، دستهٔ موردنظرتان را ببینید.
              </p>
            </div>
            <Link
              to={ROUTES.categories}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-800 hover:underline"
            >
              همه دسته‌بندی‌ها <ArrowLeft size={17} aria-hidden="true" />
            </Link>
          </div>
          {roots.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roots.slice(0, 6).map((category) => (
                <Link
                  key={category.id}
                  to={ROUTES.category(category.slug)}
                  className="group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-orange-300 hover:shadow-sm focus-visible:outline-orange-600"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-800">
                    {category.image ? (
                      <img
                        src={category.image}
                        alt=""
                        width={48}
                        height={48}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <LayoutGrid size={22} aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-black text-slate-900 group-hover:text-orange-800">
                      {category.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {toPersianDigits(category.productCount)} کالا
                    </span>
                  </span>
                  <ArrowLeft
                    size={17}
                    aria-hidden="true"
                    className="text-orange-700"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="results-title" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-orange-800">نتایج جستجو</p>
              <h2
                id="results-title"
                className="mt-1 text-lg font-black text-slate-900 sm:text-xl"
              >
                برای «{term}»
              </h2>
            </div>
            {result && (
              <p role="status" className="text-sm font-bold text-slate-600">
                {toPersianDigits(result.meta.total)} کالا یافت شد
              </p>
            )}
          </div>
          <div
            aria-label="فیلتر و مرتب‌سازی نتایج"
            className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <span className="flex min-h-11 items-center gap-2 text-sm font-black text-slate-900">
              <SlidersHorizontal size={18} aria-hidden="true" /> پالایش نتایج
            </span>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-bold text-slate-600 sm:max-w-64">
              دسته‌بندی
              <select
                value={categoryId}
                onChange={(event) =>
                  updateParam("category", event.target.value)
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-orange-600"
              >
                <option value="">همه دسته‌بندی‌ها</option>
                {categories
                  .filter((category) => category.productCount > 0)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-bold text-slate-600 sm:max-w-52">
              مرتب‌سازی
              <select
                value={sortBy}
                onChange={(event) => updateParam("sort", event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-orange-600"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:border-orange-300">
              <input
                type="checkbox"
                checked={available}
                onChange={(event) =>
                  updateParam("available", event.target.checked ? "1" : "")
                }
                className="accent-orange-700"
              />{" "}
              فقط کالاهای موجود
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:border-orange-300">
              <input
                type="checkbox"
                checked={discounted}
                onChange={(event) =>
                  updateParam("discounted", event.target.checked ? "1" : "")
                }
                className="accent-orange-700"
              />{" "}
              دارای تخفیف
            </label>
          </div>
          {(categoryId || available || discounted || sortBy !== "newest") && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>فیلترهای فعال:</span>
              {categoryId && (
                <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-900">
                  {categories.find((category) => category.id === categoryId)
                    ?.name ?? "دسته انتخاب‌شده"}
                </span>
              )}
              {available && (
                <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-900">
                  موجود
                </span>
              )}
              {discounted && (
                <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-900">
                  تخفیف‌دار
                </span>
              )}
              {sortBy !== "newest" && (
                <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-900">
                  {
                    SORT_OPTIONS.find((option) => option.value === sortBy)
                      ?.label
                  }
                </span>
              )}
              <button
                type="button"
                onClick={() => setParams({ q: term })}
                className="min-h-9 rounded-lg px-2 font-bold text-orange-800 hover:underline"
              >
                حذف فیلترها
              </button>
            </div>
          )}
          {!result && !error && (
            <div
              role="status"
              className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-slate-100 bg-white p-3 motion-reduce:animate-none"
                >
                  <div className="aspect-square rounded-xl bg-slate-100" />
                  <div className="mt-4 h-4 w-4/5 rounded bg-slate-100" />
                  <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
                </div>
              ))}
              <span className="sr-only">در حال جستجو…</span>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
            >
              <p>دریافت نتایج جستجو با خطا مواجه شد. لطفاً دوباره تلاش کنید.</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="mt-3 min-h-11 rounded-xl bg-red-800 px-4 font-bold text-white"
              >
                تلاش دوباره
              </button>
            </div>
          )}
          {result && result.items.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Search
                size={30}
                aria-hidden="true"
                className="mx-auto text-slate-400"
              />
              <h3 className="mt-3 font-black text-slate-900">
                کالایی برای «{term}» پیدا نشد
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                نام یا مدل کوتاه‌تری را امتحان کنید؛ اگر فیلتر گذاشته‌اید، آن را
                بردارید.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {(categoryId ||
                  available ||
                  discounted ||
                  sortBy !== "newest") && (
                  <button
                    type="button"
                    onClick={() => setParams({ q: term })}
                    className="min-h-11 rounded-xl bg-orange-50 px-4 text-sm font-bold text-orange-800 hover:bg-orange-100"
                  >
                    نمایش بدون فیلتر
                  </button>
                )}
                <Link
                  to={ROUTES.categories}
                  className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:border-orange-300"
                >
                  دیدن دسته‌بندی‌ها
                </Link>
              </div>
            </div>
          )}
          {result && result.items.length > 0 && (
            <div className="mt-6">
              <ProductGrid products={result.items} />
            </div>
          )}
          {result && result.meta.pages > 1 && (
            <nav
              aria-label="صفحه‌بندی نتایج"
              className="mt-7 flex items-center justify-center gap-3"
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => movePage(page - 1)}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:border-orange-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={16} aria-hidden="true" /> قبلی
              </button>
              <span className="text-sm text-slate-600">
                صفحهٔ {toPersianDigits(page)} از{" "}
                {toPersianDigits(result.meta.pages)}
              </span>
              <button
                type="button"
                disabled={page >= result.meta.pages}
                onClick={() => movePage(page + 1)}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:border-orange-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                بعدی <ChevronLeft size={16} aria-hidden="true" />
              </button>
            </nav>
          )}
        </section>
      )}
    </main>
  );
}
