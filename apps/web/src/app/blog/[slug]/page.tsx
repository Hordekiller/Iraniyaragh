import Link from 'next/link'
import { RichText } from '../../../components/product/RichText'
import { blogPost } from '../../../server/blog'
import { hasNonPageQuery, metadataFor, type SearchParams } from '../../../server/policy'
import { JsonLd, articleJsonLd, breadcrumb, plainDescription } from '../../../server/structured-data'
import { formatTimestamp, toPersianDigits } from '../../../lib/format'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }
export async function generateMetadata({ params, searchParams }: Props) {
  const post = await blogPost((await params).slug)
  return metadataFor({
    title: post.seoTitle ?? post.title, description: post.seoDescription ?? post.excerpt, path: `/blog/${encodeURIComponent(post.slug)}`,
    indexable: !hasNonPageQuery(await searchParams), image: post.cover ?? undefined, rss: true,
    article: { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, tags: post.tags },
  })
}
export default async function Page({ params, searchParams }: Props) {
  const post = await blogPost((await params).slug)
  const path = `/blog/${encodeURIComponent(post.slug)}`
  const words = plainDescription(post.bodyHtml).split(' ').filter(Boolean).length
  const structured = Object.keys(await searchParams).length === 0
  return <article className="mx-auto max-w-[820px] px-4 py-8 lg:px-6" itemScope itemType="https://schema.org/BlogPosting">
    <nav aria-label="مسیر صفحه" className="mb-4 text-xs text-slate-500"><Link href="/">خانه</Link> / <Link href="/blog">مقالات</Link> / <span aria-current="page">{post.title}</span></nav>
    <header>
      <h1 className="text-2xl font-black leading-[1.9] text-slate-900 lg:text-3xl" itemProp="headline">{post.title}</h1>
      <p className="mt-3 text-base leading-8 text-slate-700">{post.excerpt}</p>
      <p className="mt-4 text-xs text-slate-500">
        انتشار: <time dateTime={post.publishedAt} itemProp="datePublished">{formatTimestamp(post.publishedAt)}</time>
        {post.updatedAt.slice(0, 10) !== post.publishedAt.slice(0, 10) && <> · به‌روزرسانی: <time dateTime={post.updatedAt} itemProp="dateModified">{formatTimestamp(post.updatedAt)}</time></>}
        <span aria-hidden="true"> · </span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه
      </p>
    </header>
    {post.cover && <figure className="mt-6"><img src={post.cover.url} alt={post.cover.alt} width={post.cover.width} height={post.cover.height} decoding="async" fetchPriority="high" className="h-auto w-full rounded-2xl" /></figure>}
    <RichText html={post.bodyHtml} className="mt-6 text-base leading-9 text-slate-800" />
    {post.sources.length > 0 && <section aria-labelledby="blog-sources" className="mt-10 border-t border-slate-200 pt-6">
      <h2 id="blog-sources" className="text-base font-black text-slate-900">منابع</h2>
      <ol className="mt-3 list-decimal space-y-2 pr-5 text-sm leading-7">
        {post.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline">{source.title}</a> <span className="text-xs text-slate-500">(بازدید: {formatTimestamp(source.accessedAt)})</span></li>)}
      </ol>
    </section>}
    {post.tags.length > 0 && <ul aria-label="برچسب‌ها" className="mt-8 flex flex-wrap gap-2 text-xs">{post.tags.map(tag => <li key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{tag}</li>)}</ul>}
    {structured && <JsonLd data={[articleJsonLd(post, words), breadcrumb([{ name: 'خانه', path: '/' }, { name: 'مقالات', path: '/blog' }, { name: post.title, path }])]} />}
  </article>
}
