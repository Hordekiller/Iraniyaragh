import { blogList } from '../../../server/blog'
import { absolute, isProductionDiscovery, STORE_NAME } from '../../../server/policy'
import { buildFeed } from '../../../server/blog-feed'

/** RSS 2.0 of the newest live articles. Non-production feeds are noindex like every other page. */
export async function GET() {
  const list = await blogList(1)
  const xml = buildFeed({ title: `${STORE_NAME} — مقالات`, link: absolute('/blog'), self: absolute('/blog/feed.xml'), description: 'تازه‌ترین مقاله‌ها و راهنماهای ایرانی یراق دربارهٔ یراق‌آلات کابینت و ابزار.', posts: list.items.slice(0, 20), origin: absolute('') })
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...(isProductionDiscovery() ? {} : { 'X-Robots-Tag': 'noindex, nofollow' }) } })
}
