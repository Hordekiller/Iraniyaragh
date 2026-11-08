import Link from 'next/link'
import type { BlogPublicSummary } from '@iranyaragh/contracts'
import { formatTimestamp, toPersianDigits } from '../../lib/format'

export function BlogCard({ post, priority = false }: { post: BlogPublicSummary; priority?: boolean }) {
  return <article className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-slate-100 bg-white transition hover:border-slate-200 hover:shadow-lg motion-reduce:transition-none">
    {post.cover && <Link href={`/blog/${encodeURIComponent(post.slug)}`} tabIndex={-1} aria-hidden="true" className="block aspect-[16/9] overflow-hidden bg-slate-50">
      <img src={post.cover.url} alt="" width={post.cover.width} height={post.cover.height} decoding="async" loading={priority ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
    </Link>}
    <div className="flex flex-1 flex-col p-5">
      <h2 className="text-base font-black leading-7 text-slate-900">
        <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="hover:text-[#C2410C] focus-visible:underline">{post.title}</Link>
      </h2>
      <p className="mt-2 line-clamp-3 text-sm leading-7 text-slate-600">{post.excerpt}</p>
      <p className="mt-auto pt-4 text-xs text-slate-500">
        <time dateTime={post.publishedAt}>{formatTimestamp(post.publishedAt)}</time>
        <span aria-hidden="true"> · </span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه
      </p>
    </div>
  </article>
}
