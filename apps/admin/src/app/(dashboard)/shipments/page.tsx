import { ShipmentsView, type ShipmentsUrlQuery } from '@/components/shipments/ShipmentsView';

export type ShipmentsPageSearchParams = Record<string, string | string[] | undefined>;

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<ShipmentsPageSearchParams>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const query: ShipmentsUrlQuery = {
    page: first(params.page),
    perPage: first(params.perPage),
    status: first(params.status),
    carrier: first(params.carrier),
    trackingCode: first(params.trackingCode),
    dispatchedFrom: first(params.dispatchedFrom),
    dispatchedTo: first(params.dispatchedTo),
    sortBy: first(params.sortBy),
    sortDir: first(params.sortDir),
  };

  return <ShipmentsView initialQuery={query} />;
}
