import { ProductIsland } from '../../../components/next/Storefront'
import { product, eligibility } from '../../../server/catalog'
import { productReviews } from '../../../server/reviews'
import { entityPath, metadataFor, type SearchParams } from '../../../server/policy'
import { JsonLd, breadcrumb, productJsonLd, plainDescription } from '../../../server/structured-data'

import { validVariantQuery, requestedCatalogVariant } from '../../../services/catalog/variants'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }
export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params
  const item = await product(slug)
  const [indexable, query] = await Promise.all([eligibility('products', item.slug), searchParams])
  const cover = item.media.find(media => media.kind === 'IMAGE')
  // Share previews use the widest rendition, with its real dimensions and the image's own alt text.
  const widest = cover?.sources.reduce<(typeof cover.sources)[number] | undefined>((best, source) => (!best || source.width > best.width ? source : best), undefined)
  const image = widest && cover ? { url: widest.url, width: widest.width, height: widest.height, alt: cover.alt || item.name } : undefined
  return metadataFor({ title: item.name, description: plainDescription(item.description).slice(0, 180) || `مشخصات و قیمت ${item.name} در ایرانی یراق`, path: entityPath('products', item.slug), indexable: indexable && validVariantQuery(item.variants, query), image })
}
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params
  const item = await product(slug)
  const [indexable, query, reviews] = await Promise.all([eligibility('products', item.slug), searchParams, productReviews(item.slug)])
  const crumbs = [{ name: 'خانه', path: '/' }, ...(item.category ? [{ name: item.category.name, path: entityPath('categories', item.category.slug) }] : []), { name: item.name, path: entityPath('products', item.slug) }]
  const selected = requestedCatalogVariant(item.variants, query.variant)
  const schema = productJsonLd(item, reviews, selected?.id)
  return <>{indexable && validVariantQuery(item.variants, query) && <JsonLd data={[...(schema ? [schema] : []), breadcrumb(crumbs)]} />}<ProductIsland key={`${item.id}:${selected?.id ?? ''}`} product={item} reviews={reviews} /></>
}
