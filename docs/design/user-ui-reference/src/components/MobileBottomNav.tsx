import { useState } from "react";
import { Home, LayoutGrid, ShoppingCart, BookOpen, Menu as MenuIcon, X, Phone, MapPin } from "lucide-react";
import { useCart } from "../context/useCart";
import { toPersianDigits } from "../lib/utils";

const items = [
  { id: "home", label: "خانه", icon: Home },
  { id: "categories", label: "دسته‌ها", icon: LayoutGrid },
  { id: "cart", label: "سبد خرید", icon: ShoppingCart, isCart: true },
  { id: "blog", label: "وبلاگ", icon: BookOpen },
  { id: "more", label: "بیشتر", icon: MenuIcon, isMore: true },
];

const moreLinks = [
  { id: "services", label: "خدمات" },
  { id: "about", label: "درباره ما" },
  { id: "products", label: "محصولات پرفروش" },
];

export default function MobileBottomNav() {
  const { totalCount, openCart } = useCart();
  const [active, setActive] = useState("home");
  const [moreOpen, setMoreOpen] = useState(false);

  const handleClick = (id: string, isCart?: boolean, isMore?: boolean) => {
    if (isCart) {
      openCart();
      return;
    }
    if (isMore) {
      setMoreOpen(true);
      return;
    }
    setActive(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* floating detached bottom nav - mobile only */}
      <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-50">
        <div className="relative mx-auto max-w-md h-16 rounded-full bg-[#181b20]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 flex items-center justify-between px-3">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id && !item.isCart && !item.isMore;

            if (item.isCart) {
              return (
                <button
                  key={item.id}
                  onClick={() => handleClick(item.id, true)}
                  aria-label={item.label}
                  className="relative -mt-8 flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-900/50 border-4 border-[#0f1216] active:scale-95 transition-transform"
                >
                  <Icon className="w-6 h-6 text-[#0f1216]" strokeWidth={2.5} />
                  {totalCount > 0 && (
                    <span className="absolute -top-0.5 -left-0.5 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold border-2 border-[#0f1216]">
                      {toPersianDigits(totalCount)}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => handleClick(item.id, false, item.isMore)}
                className="flex flex-col items-center justify-center gap-1 w-14 h-full"
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? "text-amber-400" : "text-stone-400"
                  }`}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    isActive ? "text-amber-400" : "text-stone-500"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* more sheet */}
      <div
        className={`lg:hidden fixed inset-0 z-[70] transition-opacity duration-300 ${
          moreOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        />
        <div
          className={`absolute bottom-0 left-0 right-0 rounded-t-3xl bg-[#14181d] border-t border-white/10 p-6 pb-28 transition-transform duration-300 ${
            moreOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-white font-bold text-lg">دسترسی سریع</h3>
            <button
              onClick={() => setMoreOpen(false)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-stone-300 hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {moreLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  setMoreOpen(false);
                  const el = document.getElementById(link.id);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="text-right px-4 py-3.5 rounded-xl bg-white/5 text-stone-200 font-medium hover:bg-white/10 hover:text-amber-400 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>
          <div className="mt-5 pt-5 border-t border-white/10 text-stone-400 text-sm space-y-3">
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
