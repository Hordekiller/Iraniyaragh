import Link from 'next/link'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { ProductGrid } from '../components/product/ProductGrid'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { CategoryChips } from '../components/catalog/CategoryChips'
import { catalogFilters, listingHref } from './catalog-filters'
import { brands, categories, categoryFilters, eligibility, products } from './catalog'
import { decodedRouteSlug, entityPath, hasNonPageQuery, metadataFor, pageNumber, type SearchParams } from './policy'
import { JsonLd, breadcrumb, collectionJsonLd } from './structured-data'
import { categoryAncestors } from './category-ancestors'

type Kind = 'categories' | 'brands' | 'catalog'
export async function collectionData(kind: Kind, slug: string, query: SearchParams) {
  const page = pageNumber(query)
  const decodedSlug = kind === 'catalog' ? '' : decodedRouteSlug(slug)
  if (!page || decodedSlug === null) notFound()
  const filters = catalogFilters(query)
  if (!filters) notFound()
  return collectionSnapshot(kind, decodedSlug, page, hasNonPageQuery(query), JSON.stringify(filters))
}
// Primitive request-local keys coalesce metadata and page reads without a cross-request cache.
const collectionSnapshot = cache(async (kind: Kind, slug: string, page: number, filtered: boolean, filtersJson: string) => {
  const allCategories = kind === 'categories' ? await categories() : []
  const category = kind === 'categories' ? allCategories.find(item => item.slug === slug) ?? null : null
  const entity = category ?? (kind === 'brands' ? (await brands()).find(item => item.slug === slug) : null)
  if (kind !== 'catalog' && !entity) notFound()
  const [result, indexable] = await Promise.all([
    products({ ...JSON.parse(filtersJson), ...(kind === 'categories' ? { categoryId: entity!.id } : kind === 'brands' ? { brand: slug } : {}), page, perPage: 24 }),
    kind === 'catalog' ? Promise.resolve(true) : eligibility(kind, slug),
  ])
  if (page > 1 && result.items.length === 0) notFound()
  const basePath = kind === 'catalog' ? '/catalog' : entityPath(kind, slug)
  const title = entity?.name ?? 'همهٔ کالاها'
  const ancestors = kind === 'categories' && entity ? categoryAncestors(allCategories, entity.id) : []
  return { category, ancestors, title, basePath, path: `${basePath}${page > 1 ? `?page=${page}` : ''}`, page, result, indexable: indexable && !filtered && result.items.length > 0, children: entity ? allCategories.filter(item => item.parentId === entity.id) : [], siblings: category ? allCategories.filter(item => item.parentId === category.parentId) : [] }
})
export async function collectionMetadata(kind: Kind, slug: string, query: SearchParams) {
  const data = await collectionData(kind, slug, query)
  return metadataFor({ title: `${data.title}${data.page > 1 ? ` — صفحهٔ ${data.page}` : ''}`, description: `کالاهای ${data.title} در ایرانی یراق؛ مشاهدهٔ مشخصات و قیمت محصولات منتشرشده.`, path: data.path, indexable: data.indexable })
}
export async function CollectionPage({ kind, slug = '', query }: { kind: Kind; slug?: string; query: SearchParams }) {
  const data = await collectionData(kind, slug, query)
  const [categoryOptions, brandOptions, attributes] = await Promise.all([categories(), brands(), data.category ? categoryFilters(data.category.id) : typeof query.categoryId === 'string' && query.categoryId ? categoryFilters(query.categoryId) : Promise.resolve([])])
  return <>
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر صفحه" className="text-xs text-slate-500 mb-3"><Link href="/">خانه</Link>{kind === 'categories' && <><span className="mx-1" aria-hidden="true">/</span><Link href="/categories">همه دسته‌بندی‌ها</Link></>}{data.ancestors.map(ancestor => <span key={ancestor.id}> / <Link href={entityPath('categories', ancestor.slug)}>{ancestor.name}</Link></span>)} / <span aria-current="page">{data.title}</span></nav>
      <h1 className="font-black text-slate-900 text-xl">{data.title}{data.page > 1 ? ` — صفحهٔ ${data.page}` : ''}</h1>
      {kind === 'categories' && data.category && <CategoryChips categories={[...data.siblings, ...data.children.filter(child => !data.siblings.some(sibling => sibling.id === child.id))]} activeId={data.category.id} />}
      {data.children.length > 0 && <section className="mt-6 hidden lg:block" aria-labelledby="category-children-title"><h2 id="category-children-title" className="text-base font-bold text-slate-900">زیردسته‌های {data.title}</h2><CategoryGrid categories={data.children} /></section>}
      <form action={data.basePath} method="get" className="my-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        {kind === 'catalog' && <label className="flex min-w-0 flex-col gap-1 text-sm">دسته<select name="categoryId" defaultValue={typeof query.categoryId === 'string' ? query.categoryId : ''} className="min-h-11 max-w-60 rounded-lg border p-2"><option value="">همهٔ دسته‌ها</option>{categoryOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {kind !== 'brands' && <label className="flex min-w-0 flex-col gap-1 text-sm">برند<select name="brand" defaultValue={typeof query.brand === 'string' ? query.brand : ''} className="min-h-11 max-w-60 rounded-lg border p-2"><option value="">همهٔ برندها</option>{brandOptions.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>}
        {attributes.map(attribute => <label key={attribute.code} className="flex flex-col gap-1 text-sm">{attribute.name}<select name={`attr.${attribute.code}`} defaultValue={typeof query[`attr.${attribute.code}`] === 'string' ? query[`attr.${attribute.code}`] : ''} className="min-h-11 rounded-lg border p-2"><option value="">همه</option>{attribute.options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>)}
        <label className="flex flex-col gap-1 text-sm">ترتیب<select name="sort" defaultValue={typeof query.sort === 'string' ? query.sort : 'newest'} className="min-h-11 rounded-lg border p-2"><option value="newest">جدیدترین</option><option value="popular">پرفروش‌ترین</option><option value="price_asc">ارزان‌ترین</option><option value="price_desc">گران‌ترین</option></select></label>
        {['minPrice', 'maxPrice'].map((key, index) => <label key={key} className="flex min-w-0 flex-col gap-1 text-sm">{index ? 'بیشترین قیمت (ریال)' : 'کمترین قیمت (ریال)'}<input className="min-h-11 w-36 rounded-lg border p-2" name={key} inputMode="numeric" pattern="[0-9]{1,15}" defaultValue={typeof query[key] === 'string' ? query[key] : ''} /></label>)}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input name="available" type="checkbox" value="true" defaultChecked={query.available === 'true'} />فقط موجود</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input name="discounted" type="checkbox" value="true" defaultChecked={query.discounted === 'true'} />کاهش قیمت واقعی</label>
        {Object.entries(query).filter(([key, value]) => typeof value === 'string' && key === 'ids').map(([key, value]) => <input key={key} type="hidden" name={key} value={String(value)} />)}
        <button type="submit" className="min-h-11 rounded-xl bg-orange-700 px-4 font-bold text-white">اعمال فیلتر</button><Link className="inline-flex min-h-11 items-center text-sm underline" href={data.basePath}>پاک کردن</Link>
      </form>
      <p className="text-sm text-slate-600">{data.result.meta.total.toLocaleString('fa-IR')} کالا</p>
      <section className="mt-5" aria-labelledby="collection-products-title"><h2 id="collection-products-title" className="sr-only">کالاهای {data.title}</h2>{data.result.items.length ? <ProductGrid products={data.result.items} /> : <p>کالایی با این شرایط یافت نشد.</p>}</section>
      <nav aria-label="صفحه‌بندی کالاها" className="mt-8 flex gap-6">
        {data.page > 1 && <Link rel="prev" href={listingHref(data.basePath, query, data.page - 1)}>صفحهٔ قبل</Link>}
        {data.page < data.result.meta.pages && <Link rel="next" href={listingHref(data.basePath, query, data.page + 1)}>صفحهٔ بعد</Link>}
      </nav>
      {data.indexable && <JsonLd data={[collectionJsonLd({ name: data.title, path: data.path, products: data.result.items, offset: (data.page - 1) * 24 }), breadcrumb([{ name: 'خانه', path: '/' }, ...data.ancestors.map(ancestor => ({ name: ancestor.name, path: entityPath('categories', ancestor.slug) })), { name: data.title, path: data.path }])]} />}
    </div>
  </>
}
