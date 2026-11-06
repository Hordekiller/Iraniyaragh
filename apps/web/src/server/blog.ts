import 'server-only'
import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import type { BlogPublicList, BlogPublicListResponse, BlogPublicPost, BlogPublicPostResponse } from '@iranyaragh/contracts'
import { apiOrigin, publicJson } from './catalog'
import { fixtureBlogList, fixtureBlogPost } from './blog-fixture'
import { validSlug } from './policy'

function isolatedFixture() { return process.env.APP_ENVIRONMENT === 'test' && process.env.NEXT_PUBLIC_FIXTURE_CATALOG === 'true' }
/** Only live articles reach the storefront; drafts, scheduled and archived posts are 404 at the API. */
export const blogList = cache(async (page: number): Promise<BlogPublicList> => {
  if (isolatedFixture()) return fixtureBlogList(page)
  return (await publicJson<BlogPublicListResponse>(`/api/v1/blog/posts?page=${page}`)).data
})
export const blogPost = cache(async (slug: string): Promise<BlogPublicPost> => {
  if (!validSlug(slug)) notFound()
  const result = isolatedFixture() ? fixtureBlogPost(slug) : (await publicJson<BlogPublicPostResponse>(`/api/v1/blog/posts/${encodeURIComponent(slug)}`)).data
  // A renamed article answers with its new slug: one permanent hop, no chain.
  if (result.redirectSlug) permanentRedirect(`/blog/${encodeURIComponent(result.redirectSlug)}`)
  if (!result.post) notFound()
  return result.post
})
/**
 * Whether navigation should link to the blog. Best-effort: an API hiccup hides the link
 * instead of failing every page, and the short revalidation keeps it off the hot path.
 */
export async function hasLiveBlog(): Promise<boolean> {
  if (isolatedFixture()) return true
  try {
    const response = await fetch(`${apiOrigin()}/api/v1/blog/posts?page=1`, { credentials: 'omit', signal: AbortSignal.timeout(1_500), next: { revalidate: 60 } })
    if (!response.ok) return false
    return ((await response.json()) as BlogPublicListResponse).data.meta.total > 0
  } catch { return false }
}
