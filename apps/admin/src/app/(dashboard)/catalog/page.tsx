import { ProductsView, type CatalogUrlQuery } from '@/components/catalog/ProductsView';

export type CatalogPageSearchParams = Record<string, string | string[] | undefined>;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogPageSearchParams>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const query: CatalogUrlQuery = {
    page: first(params.page),
    perPage: first(params.perPage),
    search: first(params.search),
    status: first(params.status),
    brandId: first(params.brandId),
    categoryId: first(params.categoryId),
    sortBy: first(params.sortBy),
    sortDir: first(params.sortDir),
  };

  return <ProductsView initialQuery={query} />;
}