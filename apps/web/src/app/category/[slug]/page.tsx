import { notFound, permanentRedirect } from 'next/navigation'
import { categories } from '../../../server/catalog'
import { entityPath, validSlug } from '../../../server/policy'

export default async function LegacyCategory({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!validSlug(slug)) notFound()
  const item = (await categories()).find(category => category.slug === slug || category.id === slug)
  if (!item) notFound()
  permanentRedirect(entityPath('categories', item.slug))
}
