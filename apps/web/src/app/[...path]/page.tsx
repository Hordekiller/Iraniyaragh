import { isProductionDiscovery } from '../../server/policy'
import { notFound } from 'next/navigation'
import { PrivateJourney } from '../../components/next/PrivateJourney'
import { isPrivateJourneyPath } from '../../lib/private-journey-path'
import { privateJourneyTitle } from '../../lib/private-journey-title'
export async function generateMetadata({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return { title: `${privateJourneyTitle(path)} | ایرانی یراق`, robots: { index: false, follow: isProductionDiscovery() } }
}
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (!isPrivateJourneyPath(path)) notFound()
  return <PrivateJourney />
}
