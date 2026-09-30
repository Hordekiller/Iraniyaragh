import { ProductListing } from '../components/catalog/ProductListing'
import { useDocumentMeta } from '../lib/use-document-meta'
import { ROUTES } from '../lib/routes'

/**
 * The whole catalog. This is the real destination behind the header/footer
 * "all products" links, and the only place the storefront offers paging over the
 * full catalog — the count, the range and the page buttons all come from the
 * API's own `meta`.
 */
export function ProductsPage() {
  useDocumentMeta({
    title: 'همه کالاها',
    description: 'مرور کامل کاتالوگ فروشگاه با قیمت و موجودی زنده، به‌همراه مرتب‌سازی و فیلتر برند.',
    canonicalPath: ROUTES.products,
  })

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <ProductListing
        title="همه کالاها"
        subtitle="کاتالوگ فروشگاه با قیمت و موجودی زنده"
        crumbs={[{ label: 'همه کالاها' }]}
        defaultSort="newest"
        emptyMessage="هنوز کالایی در فروشگاه ثبت نشده است."
        sortId="products-sort"
        brandId="products-brand"
      />
    </div>
  )
}
