import { CollectionPage, collectionMetadata } from '../../../server/CollectionPage'
import type { SearchParams } from '../../../server/policy'
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }
export async function generateMetadata({ params, searchParams }: Props) { return collectionMetadata('categories', (await params).slug, await searchParams) }
export default async function Page({ params, searchParams }: Props) { return <CollectionPage kind="categories" slug={(await params).slug} query={await searchParams} /> }
