import { CreditAccountView } from '@/components/credit/CreditAccountView';
export default async function CustomerCreditPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CreditAccountView key={customerId} customerId={customerId} />;
}
