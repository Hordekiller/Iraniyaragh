import { CollectionPage, collectionMetadata } from '../../../server/CollectionPage'
import type { SearchParams } from '../../../server/policy'
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }
export async function generateMetadata({ params, searchParams }: Props) { return collectionMetadata('brands', (await params).slug, await searchParams) }
export default async function Page({ params, searchParams }: Props) { return <CollectionPage kind="brands" slug={(await params).slug} query={await searchParams} /> }
