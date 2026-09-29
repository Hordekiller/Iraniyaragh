import { StocktakeDetailView } from '@/components/stocktake/StocktakeDetailView';

export default async function StocktakeDetailPage({ params }: { params: Promise<{ stocktakeId: string }> }) {
  const { stocktakeId } = await params;
  return <StocktakeDetailView stocktakeId={stocktakeId} />;
}
