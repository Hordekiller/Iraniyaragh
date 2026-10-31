import { permanentRedirect } from 'next/navigation'
import { product } from '../../../server/catalog'
import { entityPath } from '../../../server/policy'

/** Resolve legacy IDs and slugs before redirecting, avoiding an ID-to-slug chain. */
export default async function LegacyProduct({ params }: { params: Promise<{ slug: string }> }) {
  const item = await product((await params).slug)
  permanentRedirect(entityPath('products', item.slug))
}
