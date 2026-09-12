import { useEffect, useState } from "react";
import {
  Search,
  ShoppingCart,
  Menu,
  Phone,
  MapPin,
  Wrench,
  X,
} from "lucide-react";
import { useCart } from "../context/useCart";
import { toPersianDigits } from "../lib/utils";

const navLinks = [
  { id: "home", label: "خانه" },
  { id: "categories", label: "دسته‌بندی‌ها" },
  { id: "products", label: "محصولات پرفروش" },
  { id: "services", label: "خدمات" },
  { id: "blog", label: "وبلاگ" },
  { id: "about", label: "درباره ما" },
];

export default function Header() {
  const { totalCount, openCart } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setDrawerOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* top info bar */}
      <div className="hidden lg:block bg-[#14181d] text-stone-300 text-sm">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500" />
              تهران، خیابان ولیعصر، پلاک ۱۲۴
            </span>
            <span className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500" />
              {toPersianDigits("021-88776655")}
            </span>
          </div>
          <div className="flex items-center gap-4 text-stone-400">
            <span>ارسال رایگان برای خرید بالای {toPersianDigits("۲٬۰۰۰٬۰۰۰")} تومان</span>
          </div>
        </div>
      </div>

      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-[#0f1216]/95 backdrop-blur-xl shadow-lg shadow-black/20"
            : "bg-[#0f1216]"
        } border-b border-white/5`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 lg:h-20 gap-4">
            {/* logo */}
            <a href="#home" onClick={() => scrollTo("home")} className="flex items-center gap-2 shrink-0 group">
              <span className="relative flex items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-900/30 group-hover:rotate-6 transition-transform">
                <Wrench className="w-5 h-5 lg:w-6 lg:h-6 text-[#0f1216]" strokeWidth={2.5} />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-lg lg:text-xl font-black text-white tracking-tight">
                  ابزار<span className="text-amber-500">پرو</span>
                </span>
                <span className="hidden sm:block text-[11px] text-stone-400 font-medium tracking-wide">
                  فروشگاه تخصصی ابزار
                </span>
              </span>
            </a>

            {/* desktop nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.id)}
                  className="px-4 py-2 text-sm font-medium text-stone-300 hover:text-amber-400 rounded-lg hover:bg-white/5 transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* search desktop */}
            <form
              onSubmit={(e) => e.preventDefault()}
              className="hidden md:flex items-center flex-1 max-w-xs relative"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="text"
                placeholder="جستجوی ابزار..."
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-4 pr-10 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/10 transition-colors"
              />
              <Search className="w-4 h-4 text-stone-500 absolute right-3.5" />
            </form>

            {/* actions */}
            <div className="flex items-center gap-2">
              <button
                aria-label="جستجو"
                className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-stone-300 hover:bg-white/10 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={openCart}
                aria-label="سبد خرید"
                className="relative w-10 h-10 lg:w-11 lg:h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-stone-200 hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalCount > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[#0f1216] text-[11px] font-bold">
                    {toPersianDigits(totalCount)}
                  </span>
                )}
              </button>
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="منو"
                className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-stone-200 hover:bg-white/10 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* mobile drawer menu */}
      <div
        className={`fixed inset-0 z-[70] lg:hidden transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute top-0 right-0 h-full w-[82%] max-w-sm bg-[#14181d] border-l border-white/10 shadow-2xl transition-transform duration-300 flex flex-col ${
            drawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
            <span className="text-white font-black text-lg">
              ابزار<span className="text-amber-500">پرو</span>
            </span>
            <button
              onClick={() => setDrawerOpen(false)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-stone-300 hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5">
            <form onSubmit={(e) => e.preventDefault()} className="relative mb-6">
              <input
                type="text"
                placeholder="جستجوی ابزار..."
                className="w-full h-12 rounded-xl bg-white/5 border border-white/10 pl-4 pr-10 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500/50"
              />
              <Search className="w-4 h-4 text-stone-500 absolute right-3.5 top-4" />
            </form>

            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.id)}
                  className="text-right px-4 py-3.5 rounded-xl text-stone-200 font-medium hover:bg-white/5 hover:text-amber-400 transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            <button
              onClick={() => {
                setDrawerOpen(false);
                openCart();
              }}
              className="mt-6 w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-l from-amber-500 to-orange-600 text-[#0f1216] font-bold shadow-lg shadow-amber-900/30"
            >
              <ShoppingCart className="w-5 h-5" />
              مشاهده سبد خرید ({toPersianDigits(totalCount)})
            </button>
          </div>

          <div className="mt-auto p-5 border-t border-white/10 text-stone-400 text-sm space-y-3">
            <span className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500" />
              {toPersianDigits("021-88776655")}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500" />
              تهران، خیابان ولیعصر، پلاک ۱۲۴
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
