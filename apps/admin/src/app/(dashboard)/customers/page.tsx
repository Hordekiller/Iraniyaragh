import { CustomersView, type CustomersUrlQuery } from '@/components/customers/CustomersView';

export type CustomersPageSearchParams = Record<string, string | string[] | undefined>;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomersPageSearchParams>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const query: CustomersUrlQuery = {
    page: first(params.page),
    perPage: first(params.perPage),
    search: first(params.search),
    status: first(params.status),
    hasUserAccount: first(params.hasUserAccount),
    sortBy: first(params.sortBy),
    sortDir: first(params.sortDir),
  };

  return <CustomersView initialQuery={query} />;
}
