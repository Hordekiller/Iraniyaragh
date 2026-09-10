import { OrdersView, type OrdersUrlQuery } from '@/components/orders/OrdersView';

export type OrdersPageSearchParams = Record<string, string | string[] | undefined>;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersPageSearchParams>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const query: OrdersUrlQuery = {
    page: first(params.page),
    perPage: first(params.perPage),
    search: first(params.search),
    orderStatus: first(params.orderStatus),
    paymentStatus: first(params.paymentStatus),
    fulfillmentStatus: first(params.fulfillmentStatus),
    sortBy: first(params.sortBy),
    sortDir: first(params.sortDir),
  };

  return <OrdersView initialQuery={query} />;
}