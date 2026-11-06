import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BlogCard } from '../../components/blog/BlogCard'
import { blogList } from '../../server/blog'
import { hasNonPageQuery, metadataFor, pageNumber, type SearchParams } from '../../server/policy'
import { JsonLd, blogIndexJsonLd, breadcrumb } from '../../server/structured-data'

type Props = { searchParams: Promise<SearchParams> }
const title = 'مقالات و راهنماهای یراق‌آلات کابینت'
const description = 'مقاله‌ها و راهنماهای ایرانی یراق دربارهٔ انتخاب، خرید و استفاده از یراق‌آلات کابینت و ابزار.'
/** An empty or out-of-range blog is a real 404, never a thin indexable shell. */
async function data(query: SearchParams) {
  const page = pageNumber(query)
  if (!page) notFound()
  const list = await blogList(page)
  if (list.items.length === 0) notFound()
  return { page, list, filtered: hasNonPageQuery(query) }
}
export async function generateMetadata({ searchParams }: Props) {
  const { page, filtered } = await data(await searchParams)
  return metadataFor({ title: page > 1 ? `${title} — صفحهٔ ${page}` : title, description, path: page > 1 ? `/blog?page=${page}` : '/blog', indexable: !filtered, rss: true })
}
export default async function Page({ searchParams }: Props) {
  const { page, list, filtered } = await data(await searchParams)
  const path = page > 1 ? `/blog?page=${page}` : '/blog'
  return <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
    <nav aria-label="مسیر صفحه" className="text-xs text-slate-500 mb-3"><Link href="/">خانه</Link> / <span aria-current="page">مقالات</span></nav>
    <h1 className="font-black text-slate-900 text-xl">{title}{page > 1 ? ` — صفحهٔ ${page}` : ''}</h1>
    <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.items.map((post, index) => <BlogCard key={post.slug} post={post} priority={index === 0 && page === 1} />)}</div>
    <nav aria-label="صفحه‌بندی مقاله‌ها" className="mt-8 flex gap-6">
      {page > 1 && <Link rel="prev" href={page === 2 ? '/blog' : `/blog?page=${page - 1}`}>صفحهٔ قبل</Link>}
      {page < list.meta.pages && <Link rel="next" href={`/blog?page=${page + 1}`}>صفحهٔ بعد</Link>}
    </nav>
    {!filtered && <JsonLd data={[blogIndexJsonLd(list.items, path, (page - 1) * list.meta.perPage), breadcrumb([{ name: 'خانه', path: '/' }, { name: 'مقالات', path }])]} />}
  </div>
}
