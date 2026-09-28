import { TransferCreateView } from '@/components/inventory/TransferCreateView';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TransferCreatePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string => typeof value === 'string' ? value : '';
  return <TransferCreateView initialSourceWarehouseId={first(params.sourceWarehouseId)} initialVariantId={first(params.variantId)} />;
}
