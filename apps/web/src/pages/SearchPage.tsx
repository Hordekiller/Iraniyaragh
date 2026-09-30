import { useSearchParams } from 'react-router-dom'
import { ProductListing } from '../components/catalog/ProductListing'
import { useDocumentMeta } from '../lib/use-document-meta'

/**
 * Search results for a term, served by the same listing surface as the catalog
 * and category pages: live `meta.total`, brand filter, sort and paging. A
 * term-specific result page is a search surface, not an indexable landing page.
 */
export function SearchPage() {
  const [searchParams] = useSearchParams()
  const term = (searchParams.get('q') ?? '').trim()

  useDocumentMeta({
    title: term ? `جست‌وجوی ${term}` : 'جست‌وجوی کالا',
    description: term ? `نتایج جست‌وجوی «${term}» در کاتالوگ فروشگاه.` : 'در کاتالوگ فروشگاه جست‌وجو کنید.',
  })

  if (!term) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
        <h1 className="font-black text-slate-900 text-lg lg:text-xl">جست‌وجو</h1>
        <p className="mt-4 text-slate-500 text-sm">
          برای جست‌وجو، عبارت خود را در نوار جست‌وجوی بالای صفحه وارد کنید.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <ProductListing
        title={`نتایج جست‌وجو برای «${term}»`}
        subtitle="مطابقت نام، برند و دسته‌بندی کالاها"
        crumbs={[{ label: 'جست‌وجو' }]}
        defaultSort="newest"
        search={term}
        emptyMessage={`هیچ کالایی برای «${term}» پیدا نشد.`}
        sortId="search-sort"
        brandId="search-brand"
      />
    </div>
  )
}
