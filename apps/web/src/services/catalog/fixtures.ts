import { CatalogError } from './errors'
import { fixtureAllProducts, fixtureCatalogCategories } from './fixture-data'
import type { CatalogApi, CatalogCategory, CatalogListResult, CatalogProduct, CatalogQuery } from './types'

/**
 * Deterministic, contract-shaped fixture implementation of `CatalogApi`.
 *
 * Lets the storefront run and test the full catalog UX before the catalog
 * backend endpoints land on `main` (parallel-work model). It is NOT a substitute
 * for live data: it serves a small hand-authored dataset and never performs real
 * inventory/price resolution. The provider gates this client fail-closed behind
 * an explicit `VITE_FIXTURE_CATALOG=true` opt-in.
 */
export class CatalogFixtureClient implements CatalogApi {
  private readonly products: CatalogProduct[];
  private readonly categories: CatalogCategory[];
  private readonly delayMs: number;

  constructor(options: { delayMs?: number } = {}) {
    this.products = fixtureAllProducts;
    this.categories = fixtureCatalogCategories;
    this.delayMs = options.delayMs ?? 120;
  }

  async listCategories(): Promise<CatalogCategory[]> {
    await this.wait();
    // Category product counts are static fixture metadata; do not reveal them as live.
    return this.categories.map(c => ({ ...c }));
  }

  async listProducts(query: CatalogQuery = {}): Promise<CatalogListResult> {
    await this.wait();

    let items = [...this.products];

    if (query.search) {
      const term = query.search.trim().toLowerCase();
      const tokens = term.split(/\s+/).filter(Boolean)
      items = items.filter(p => {
        const haystack = [p.name, p.brand ?? '', p.category?.name ?? '']
          .join(' ')
          .toLowerCase();
        return tokens.every(token => haystack.includes(token));
      });
    }

    if (query.categorySlug) {
      items = items.filter(p => p.category?.slug === query.categorySlug);
    }

    if (query.brand) {
      const brand = query.brand.toLowerCase();
      items = items.filter(p => p.brand?.toLowerCase() === brand);
    }

    switch (query.sortBy) {
      case 'price_asc':
        items.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
        break;
      case 'price_desc':
        items.sort((a, b) => Number(b.price.amount) - Number(a.price.amount));
        break;
      case 'newest':
        // Fixture has no real timestamps; falls back to stable insertion order.
        break;
      case 'popular':
      default:
        items.sort((a, b) => b.reviews - a.reviews);
        break;
    }

    const perPage = 24;
    const page = 1;
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / perPage));

    return {
      items,
      meta: { page, perPage, total, pages },
    };
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct> {
    await this.wait();
    const product = this.products.find(p => p.slug === slug);
    if (!product) {
      throw new CatalogError({
        code: 'NOT_FOUND',
        message: 'محصول موردنظر یافت نشد.',
        statusCode: 404,
      });
    }
    return product;
  }

  private wait(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.delayMs));
  }
}
