import { CatalogError } from './errors'
import { fixtureAllProducts, fixtureCatalogCategories } from './fixture-data'
import type { CatalogApi, CatalogBrand, CatalogCategory, CatalogListResult, CatalogProduct, CatalogQuery } from './types'

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

  async listBrands(): Promise<CatalogBrand[]> {
    await this.wait();
    const names = [...new Set(this.products.map(product => product.brand).filter((name): name is string => Boolean(name)))];
    return names.map(name => ({ id: name, name, slug: name.toLowerCase().replace(/\s+/g, '-') }));
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
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name, 'fa'))
        break;
      case 'name_desc':
        items.sort((a, b) => b.name.localeCompare(a.name, 'fa'))
        break;
      case 'newest':
      default:
        // The fixture has no publish timestamps, so the newest listing keeps the
        // stable authoring order rather than inventing a ranking.
        break;
    }

    const perPage = Math.min(Math.max(1, Math.trunc(query.perPage ?? 24)), 100)
    const pages = Math.ceil(items.length / perPage)
    const total = items.length
    // A page beyond the end is clamped, so the UI can never render an empty grid
    // next to a non-zero total.
    const page = Math.min(Math.max(1, Math.trunc(query.page ?? 1)), Math.max(1, pages))
    const start = (page - 1) * perPage

    return {
      items: items.slice(start, start + perPage),
      meta: { page, perPage, total, pages },
    }
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
