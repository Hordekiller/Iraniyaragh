import { ProductIsland } from '../../../components/next/Storefront'
import { product, eligibility } from '../../../server/catalog'
import { entityPath, metadataFor, type SearchParams } from '../../../server/policy'
import { JsonLd, breadcrumb, productJsonLd, plainDescription } from '../../../server/structured-data'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }
export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params
  const item = await product(slug)
  const [indexable, query] = await Promise.all([eligibility('products', item.slug), searchParams])
  const image = item.media.find(media => media.kind === 'IMAGE')?.sources[0]?.url
  return metadataFor({ title: item.name, description: plainDescription(item.description).slice(0, 180) || `مشخصات و قیمت ${item.name} در ایرانی یراق`, path: entityPath('products', item.slug), indexable: indexable && Object.keys(query).length === 0, image })
}
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params
  const item = await product(slug)
  const [indexable, query] = await Promise.all([eligibility('products', item.slug), searchParams])
  const crumbs = [{ name: 'خانه', path: '/' }, ...(item.category ? [{ name: item.category.name, path: entityPath('categories', item.category.slug) }] : []), { name: item.name, path: entityPath('products', item.slug) }]
  return <>{indexable && Object.keys(query).length === 0 && <JsonLd data={[productJsonLd(item), breadcrumb(crumbs)]} />}<ProductIsland key={item.id} product={item} /></>
}
