import { TrendingUp } from "lucide-react";
import { products } from "../data/products";
import ProductCard from "./ProductCard";
import Carousel from "./Carousel";

export default function PopularToolsSection() {
  return (
    <section id="products" className="py-20 lg:py-28 bg-[#14181d] relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #f59e0b 0, #f59e0b 1px, transparent 1px, transparent 24px)",
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
        <div className="flex items-end justify-between mb-6 gap-4">
          <div>
            <span className="flex items-center gap-2 text-amber-500 font-bold text-sm tracking-wide">
              <TrendingUp className="w-4 h-4" />
              پرفروش‌ترین‌ها
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-2">
              ابزارهای محبوب و پرفروش
            </h2>
          </div>
        </div>

        <Carousel>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Carousel>
      </div>
    </section>
  );
}
