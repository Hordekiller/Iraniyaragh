import type { StocktakeStatus } from '@iranyaragh/contracts';
import { StocktakesView, type StocktakeFilters } from '@/components/stocktake/StocktakesView';

type SearchParams = Record<string, string | string[] | undefined>;
const statuses: readonly StocktakeStatus[] = ['DRAFT', 'COUNTING', 'REVIEW', 'COMPLETED', 'CANCELLED'];

export default async function StocktakesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string => typeof value === 'string' ? value : '';
  const filters: StocktakeFilters = {
    status: statuses.find((item) => item === first(params.status)) ?? '',
    warehouseId: first(params.warehouseId),
  };
  return <StocktakesView initialFilters={filters} />;
}
