import Link from 'next/link'
import { HomePage } from '../views/HomePage'
import { homeCatalog, brands } from '../server/catalog'
import { metadataFor, hasNonPageQuery, type SearchParams } from '../server/policy'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Resolve public data before headers: an API outage cannot become an indexable 200 shell.
  await Promise.all([homeCatalog(), brands()])
  return metadataFor({ title: 'فروشگاه تخصصی ابزار و یراق‌آلات', description: 'کاتالوگ ابزار و یراق‌آلات ایرانی یراق؛ مشخصات کالا، قیمت و وضعیت موجودی از سامانهٔ فروشگاه.', path: '/', indexable: !hasNonPageQuery(await searchParams) })
}
export default async function Page() {
  const [catalog, allBrands] = await Promise.all([homeCatalog(), brands()])
  return <><h1 className="sr-only">فروشگاه ابزار و یراق‌آلات ایرانی یراق</h1><HomePage initialCatalog={catalog} /><nav className="max-w-[1280px] mx-auto px-4 pb-8 flex flex-wrap gap-4" aria-label="کاتالوگ و برندها"><Link href="/catalog">همهٔ کالاها</Link>{allBrands.map(brand => <Link key={brand.id} href={`/brands/${encodeURIComponent(brand.slug)}`}>{brand.name}</Link>)}</nav></>
}
