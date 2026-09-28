import type { ReservationStatus } from '@iranyaragh/contracts';
import { ReservationsView, type ReservationFilters } from '@/components/inventory/ReservationsView';

type SearchParams = Record<string, string | string[] | undefined>;
const statuses: readonly ReservationStatus[] = ['ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED'];

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string => typeof value === 'string' ? value : '';
  const version = Number(first(params.version));
  const filters: ReservationFilters = {
    warehouseId: first(params.warehouseId), locationId: first(params.locationId), variantId: first(params.variantId),
    status: statuses.find((item) => item === first(params.status)) ?? '',
    version: /^\d+$/u.test(first(params.version)) && Number.isSafeInteger(version) ? version : null,
  };
  return <ReservationsView initialFilters={filters} />;
}
