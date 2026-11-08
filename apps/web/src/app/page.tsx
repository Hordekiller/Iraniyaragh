import { JsonLd, organizationJsonLd, websiteJsonLd } from '../server/structured-data'
import { HomePage } from '../views/HomePage'
import { homeCatalog } from '../server/catalog'
import { metadataFor, hasNonPageQuery, type SearchParams } from '../server/policy'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Resolve public data before headers: an API outage cannot become an indexable 200 shell.
  await homeCatalog()
  return metadataFor({ title: 'فروشگاه تخصصی یراق‌آلات کابینت و ابزار', description: 'خرید آنلاین یراق‌آلات تخصصی کابینت و ابزار از ایرانی یراق؛ مشخصات، قیمت و وضعیت موجودی هر کالا و سفارش ساخت درب با اندازهٔ دلخواه.', path: '/', indexable: !hasNonPageQuery(await searchParams) })
}
export default async function Page() {
  const catalog = await homeCatalog()
  return <><JsonLd data={[organizationJsonLd(), websiteJsonLd()]} /><HomePage initialCatalog={catalog} /></>
}
