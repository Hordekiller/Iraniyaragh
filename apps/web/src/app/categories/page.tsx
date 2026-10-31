import { CategoriesPage } from '../../views/CategoriesPage'
import { categories } from '../../server/catalog'
import { hasNonPageQuery, metadataFor, type SearchParams } from '../../server/policy'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const items = await categories()
  return metadataFor({
    title: 'دسته‌بندی کالاها',
    description: 'دسته‌بندی‌های ابزار و یراق‌آلات ایرانی یراق؛ جستجو میان دسته‌ها و دسترسی به زیر‌دسته‌ها و کالاها.',
    path: '/categories',
    indexable: items.length > 0 && !hasNonPageQuery(await searchParams),
  })
}

export default async function Page() {
  return <CategoriesPage initialCategories={await categories()} />
}
