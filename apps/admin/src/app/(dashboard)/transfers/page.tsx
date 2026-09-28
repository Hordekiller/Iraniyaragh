import type { TransferStatus } from '@iranyaragh/contracts';
import { TransfersView, type TransferFilters } from '@/components/inventory/TransfersView';

type SearchParams = Record<string, string | string[] | undefined>;
const statuses: readonly TransferStatus[] = ['DRAFT', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'];

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string => typeof value === 'string' ? value : '';
  const filters: TransferFilters = {
    sourceWarehouseId: first(params.sourceWarehouseId), targetWarehouseId: first(params.targetWarehouseId),
    status: statuses.find((item) => item === first(params.status)) ?? '',
  };
  return <TransfersView initialFilters={filters} />;
}
