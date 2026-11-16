import { AboutPage } from '../../views/StoreInfoPages'
import { STORE_PAGES } from '../../lib/store-pages'
import { metadataFor, type SearchParams } from '../../server/policy'
import { JsonLd, breadcrumb, organizationJsonLd, websiteJsonLd, webpageJsonLd } from '../../server/structured-data'

const info = STORE_PAGES.about
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return metadataFor({ ...info, indexable: Object.keys(await searchParams).length === 0 })
}
export default function Page() {
  return <><JsonLd data={[organizationJsonLd(), websiteJsonLd(), webpageJsonLd(info), breadcrumb([{ name: 'خانه', path: '/' }, { name: info.title, path: info.path }])]} /><AboutPage /></>
}
