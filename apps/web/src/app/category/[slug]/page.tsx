import { notFound, permanentRedirect } from 'next/navigation'
import { categories } from '../../../server/catalog'
import { decodedRouteSlug, entityPath } from '../../../server/policy'

export default async function LegacyCategory({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodedRouteSlug((await params).slug)
  if (slug === null) notFound()
  const item = (await categories()).find(category => category.slug === slug || category.id === slug)
  if (!item) notFound()
  permanentRedirect(entityPath('categories', item.slug))
}
