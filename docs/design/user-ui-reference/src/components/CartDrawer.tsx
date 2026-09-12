import { X, Plus, Minus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "../context/useCart";
import { formatToman, toPersianDigits } from "../lib/utils";

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeFromCart, updateQty, totalPrice } = useCart();

  return (
    <div
      className={`fixed inset-0 z-[80] transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCart} />
      <div
        className={`absolute top-0 right-0 h-full w-full sm:w-[420px] bg-[#14181d] border-l border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10 shrink-0">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-500" />
            سبد خرید ({toPersianDigits(items.length)})
          </h3>
          <button
            onClick={closeCart}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-stone-300 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-stone-500">
              <ShoppingBag className="w-14 h-14 opacity-30" />
              <p>سبد خرید شما خالی است</p>
              <button
                onClick={closeCart}
                className="mt-2 px-5 py-2.5 rounded-xl bg-amber-500 text-[#0f1216] font-semibold text-sm"
              >
                مشاهده محصولات
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 bg-white/5 border border-white/10 rounded-2xl p-3"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 rounded-xl object-cover shrink-0"
                />
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-stone-100 line-clamp-2">
                      {item.name}
                    </p>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-stone-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-amber-400 font-bold text-sm">
                      {formatToman(item.price)}
                    </span>
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg border border-white/10">
                      <button
                        onClick={() => updateQty(item.id, item.qty + 1)}
                        className="w-7 h-7 flex items-center justify-center text-stone-300 hover:text-amber-400"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold text-white w-4 text-center">
                        {toPersianDigits(item.qty)}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, item.qty - 1)}
                        className="w-7 h-7 flex items-center justify-center text-stone-300 hover:text-amber-400"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-white/10 shrink-0 space-y-3">
            <div className="flex items-center justify-between text-stone-300">
              <span>جمع کل</span>
              <span className="text-lg font-bold text-white">{formatToman(totalPrice)}</span>
            </div>
            <button className="w-full h-13 py-3.5 rounded-xl bg-gradient-to-l from-amber-500 to-orange-600 text-[#0f1216] font-bold shadow-lg shadow-amber-900/30 hover:brightness-110 transition-all">
              ادامه فرآیند خرید
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
