import { isProductionDiscovery } from '../../server/policy'
import { notFound } from 'next/navigation'
import { PrivateJourney } from '../../components/next/PrivateJourney'
export function generateMetadata() { return { title: 'حساب و خرید | ایرانی یراق', robots: { index: false, follow: isProductionDiscovery() } } }
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (!['account', 'cart', 'checkout', 'orders', 'payment', 'payment-return', 'search', 'bestsellers'].includes(path[0])) notFound()
  return <PrivateJourney />
}
