import { Star, ShoppingCart, Flame } from "lucide-react";
import type { Product } from "../data/products";
import { useCart } from "../context/useCart";
import { formatToman, toPersianDigits } from "../lib/utils";

export default function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const discount = product.oldPrice
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : 0;

  return (
    <div className="group w-[240px] sm:w-[270px] bg-[#181b20] border border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300 shadow-lg shadow-black/20 flex flex-col">
      <div className="relative aspect-square overflow-hidden bg-white/5">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          {product.badge && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-[#0f1216] text-xs font-bold">
              {product.badge}
            </span>
          )}
          {discount > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-red-500/90 text-white text-xs font-bold">
              {toPersianDigits(discount)}٪-
            </span>
          )}
        </div>
        {product.sold && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-stone-200 text-[11px] font-medium">
            <Flame className="w-3 h-3 text-amber-400" />
            {toPersianDigits(product.sold)}+ فروش
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <span className="text-[11px] text-amber-500 font-semibold mb-1">{product.category}</span>
        <h3 className="text-sm font-bold text-stone-100 leading-6 line-clamp-2 mb-2 min-h-[3rem]">
          {product.name}
        </h3>
        <div className="flex items-center gap-1 mb-3">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs text-stone-300 font-medium">{toPersianDigits(product.rating)}</span>
          <span className="text-xs text-stone-500">({toPersianDigits(product.reviews)})</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {product.oldPrice && (
              <span className="text-[11px] text-stone-500 line-through">
                {formatToman(product.oldPrice)}
              </span>
            )}
            <span className="text-sm font-bold text-white">{formatToman(product.price)}</span>
          </div>
          <button
            onClick={() =>
              addToCart({
                id: product.id,
                name: product.name,
                price: product.price,
                oldPrice: product.oldPrice,
                image: product.image,
              })
            }
            aria-label="افزودن به سبد خرید"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-[#0f1216] transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
