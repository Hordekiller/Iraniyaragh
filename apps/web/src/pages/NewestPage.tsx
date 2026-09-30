import { ProductListing } from '../components/catalog/ProductListing'
import { useDocumentMeta } from '../lib/use-document-meta'
import { ROUTES } from '../lib/routes'

/**
 * Newest products, sorted by publish date.
 *
 * The public catalog has no sales ranking, so this page never claims to be a
 * "bestsellers" list; the route and the title state exactly what is sorted.
 */
export function NewestPage() {
  useDocumentMeta({
    title: 'تازه‌ترین کالاها',
    description: 'فهرست تازه‌ترین کالاهای ثبت‌شده در فروشگاه، همراه با قیمت و موجودی زنده.',
    canonicalPath: ROUTES.newest,
  })

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <ProductListing
        title="تازه‌ترین کالاها"
        subtitle="جدیدترین محصولات کاتالوگ"
        crumbs={[{ label: 'تازه‌ترین کالاها' }]}
        defaultSort="newest"
        emptyMessage="هنوز کالایی برای نمایش وجود ندارد."
        sortId="newest-sort"
        brandId="newest-brand"
      />
    </div>
  )
}
