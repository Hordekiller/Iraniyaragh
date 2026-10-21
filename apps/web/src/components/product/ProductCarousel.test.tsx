import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogProduct } from "../../services/catalog/types";
import { ProductCarousel } from "./ProductCarousel";

const product: CatalogProduct = {
  id: "product-1",
  slug: "hinge",
  name: "لولا آرام‌بند",
  brand: null,
  category: { id: "category-1", name: "یراق کابینت", slug: "cabinet" },
  image: "/images/tool1.jpg",
  media: [],
  variants: [],
  axes: [],
  description: null,
  price: { amount: "1000000", currency: "IRR" },
  oldPrice: null,
  rating: null,
  reviews: 0,
  stockStatus: "UNKNOWN",
  badge: null,
};

describe("ProductCarousel", () => {
  const originalScrollBy = HTMLElement.prototype.scrollBy;

  afterEach(() => {
    HTMLElement.prototype.scrollBy = originalScrollBy;
    vi.restoreAllMocks();
  });

  it("exposes a labelled, keyboard-focusable list and scrolls the next set in RTL", () => {
    const scrollBy = vi.fn();
    HTMLElement.prototype.scrollBy = scrollBy;
    render(
      <MemoryRouter>
        <ProductCarousel
          id="popular"
          title="تازه‌ترین کالاها"
          products={[product]}
          moreHref="/search"
        />
      </MemoryRouter>,
    );

    const list = screen.getByRole("list", { name: /فهرست تازه‌ترین کالاها/ });
    expect(list).toHaveAttribute("dir", "rtl");
    expect(list).toHaveAttribute("tabindex", "0");
    Object.defineProperty(list, "clientWidth", {
      configurable: true,
      value: 1000,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "کالاهای بعدی در تازه‌ترین کالاها" }),
    );
    expect(scrollBy).toHaveBeenCalledWith({ left: -800, behavior: "smooth" });
    expect(screen.getByRole("link", { name: /مشاهده همه/ })).toHaveAttribute(
      "href",
      "/search",
    );
  });
});
