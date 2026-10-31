import Link from 'next/link'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ProductGrid } from '../components/product/ProductGrid'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { brands, categories, eligibility, products } from './catalog'
import { entityPath, hasNonPageQuery, metadataFor, pageNumber, type SearchParams, validSlug } from './policy'
import { JsonLd, breadcrumb } from './structured-data'
import { categoryAncestors } from './category-ancestors'

type Kind = 'categories' | 'brands' | 'catalog'
export async function collectionData(kind: Kind, slug: string, query: SearchParams) {
  const page = pageNumber(query)
  if (!page || (kind !== 'catalog' && !validSlug(slug))) notFound()
  return collectionSnapshot(kind, slug, page, hasNonPageQuery(query))
}
// Primitive request-local keys coalesce metadata and page reads without a cross-request cache.
const collectionSnapshot = cache(async (kind: Kind, slug: string, page: number, filtered: boolean) => {
  const allCategories = kind === 'categories' ? await categories() : []
  const entity = kind === 'categories' ? allCategories.find(item => item.slug === slug) : kind === 'brands' ? (await brands()).find(item => item.slug === slug) : null
  if (kind !== 'catalog' && !entity) notFound()
  const [result, indexable] = await Promise.all([
    products({ ...(kind === 'categories' ? { categoryId: entity!.id } : kind === 'brands' ? { brand: slug } : {}), page, perPage: 24 }),
    kind === 'catalog' ? Promise.resolve(true) : eligibility(kind, slug),
  ])
  if (page > 1 && result.items.length === 0) notFound()
  const basePath = kind === 'catalog' ? '/catalog' : entityPath(kind, slug)
  const title = entity?.name ?? 'همهٔ کالاها'
  const ancestors = kind === 'categories' && entity ? categoryAncestors(allCategories, entity.id) : []
  return { ancestors, title, basePath, path: `${basePath}${page > 1 ? `?page=${page}` : ''}`, page, result, indexable: indexable && !filtered, children: entity ? allCategories.filter(item => item.parentId === entity.id) : [] }
})
export async function collectionMetadata(kind: Kind, slug: string, query: SearchParams) {
  const data = await collectionData(kind, slug, query)
  return metadataFor({ title: `${data.title}${data.page > 1 ? ` — صفحهٔ ${data.page}` : ''}`, description: `کالاهای ${data.title} در ایرانی یراق؛ مشاهدهٔ مشخصات و قیمت محصولات منتشرشده.`, path: data.path, indexable: data.indexable })
}
export async function CollectionPage({ kind, slug = '', query }: { kind: Kind; slug?: string; query: SearchParams }) {
  const data = await collectionData(kind, slug, query)
  return <>
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر صفحه" className="text-xs text-slate-500 mb-3"><Link href="/">خانه</Link>{data.ancestors.map(ancestor => <span key={ancestor.id}> / <Link href={entityPath('categories', ancestor.slug)}>{ancestor.name}</Link></span>)} / <span aria-current="page">{data.title}</span></nav>
      <h1 className="font-black text-slate-900 text-xl">{data.title}{data.page > 1 ? ` — صفحهٔ ${data.page}` : ''}</h1>
      {data.children.length > 0 && <section className="mt-6" aria-labelledby="category-children-title"><h2 id="category-children-title" className="text-base font-bold text-slate-900">زیردسته‌های {data.title}</h2><CategoryGrid categories={data.children} /></section>}
      <div className="mt-5">{data.result.items.length ? <ProductGrid products={data.result.items} /> : <p>هنوز کالای منتشرشده‌ای وجود ندارد.</p>}</div>
      <nav aria-label="صفحه‌بندی کالاها" className="mt-8 flex gap-6">
        {data.page > 1 && <Link rel="prev" href={data.page === 2 ? data.basePath : `${data.basePath}?page=${data.page - 1}`}>صفحهٔ قبل</Link>}
        {data.page < data.result.meta.pages && <Link rel="next" href={`${data.basePath}?page=${data.page + 1}`}>صفحهٔ بعد</Link>}
      </nav>
      {data.indexable && <JsonLd data={breadcrumb([{ name: 'خانه', path: '/' }, ...data.ancestors.map(ancestor => ({ name: ancestor.name, path: entityPath('categories', ancestor.slug) })), { name: data.title, path: data.path }])} />}
    </div>
  </>
}
