import { InventoryView, type InventoryFilters } from '@/components/inventory/InventoryView';
import { INVENTORY_MOVEMENT_TYPES } from '@iranyaragh/contracts';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string => typeof value === 'string' ? value : '';
  const filters: InventoryFilters = {
    warehouseId: first(params.warehouseId), locationId: first(params.locationId),
    variantId: first(params.variantId),
    type: INVENTORY_MOVEMENT_TYPES.find((item) => item === first(params.type)) ?? '',
  };
  return <InventoryView initialFilters={filters} />;
}
