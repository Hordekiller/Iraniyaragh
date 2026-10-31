import { HomePage } from '../views/HomePage'
import { homeCatalog } from '../server/catalog'
import { metadataFor, hasNonPageQuery, type SearchParams } from '../server/policy'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Resolve public data before headers: an API outage cannot become an indexable 200 shell.
  await homeCatalog()
  return metadataFor({ title: 'فروشگاه تخصصی ابزار و یراق‌آلات', description: 'کاتالوگ ابزار و یراق‌آلات ایرانی یراق؛ مشخصات کالا، قیمت و وضعیت موجودی از سامانهٔ فروشگاه.', path: '/', indexable: !hasNonPageQuery(await searchParams) })
}
export default async function Page() {
  const catalog = await homeCatalog()
  return <><h1 className="sr-only">فروشگاه ابزار و یراق‌آلات ایرانی یراق</h1><HomePage initialCatalog={catalog} /></>
}
