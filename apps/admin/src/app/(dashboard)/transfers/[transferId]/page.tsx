import { TransferDetailView } from '@/components/inventory/TransferDetailView';

export default async function TransferDetailPage({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params;
  return <TransferDetailView transferId={transferId} />;
}
