import { CollectionPage, collectionMetadata } from '../../server/CollectionPage'
import type { SearchParams } from '../../server/policy'
type Props = { searchParams: Promise<SearchParams> }
export async function generateMetadata({ searchParams }: Props) { return collectionMetadata('catalog', '', await searchParams) }
export default async function Page({ searchParams }: Props) { return <CollectionPage kind="catalog" query={await searchParams} /> }
