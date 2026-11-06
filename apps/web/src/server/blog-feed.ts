import type { BlogPublicSummary } from '@iranyaragh/contracts'

const escapeXml = (value: string) => value.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
/** RSS dates are RFC 822 in GMT. */
const rfc822 = (iso: string) => new Date(iso).toUTCString()

export function buildFeed({ title, link, self, description, posts, origin }: { title: string; link: string; self: string; description: string; posts: BlogPublicSummary[]; origin: string }): string {
  const items = posts.map(post => {
    const url = `${origin}/blog/${encodeURIComponent(post.slug)}`
    return `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><pubDate>${rfc822(post.publishedAt)}</pubDate><description>${escapeXml(post.excerpt)}</description>${post.tags.map(tag => `<category>${escapeXml(tag)}</category>`).join('')}</item>`
  }).join('')
  const last = posts[0] ? `<lastBuildDate>${rfc822(posts[0].updatedAt)}</lastBuildDate>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(title)}</title><link>${escapeXml(link)}</link><description>${escapeXml(description)}</description><language>fa-IR</language>${last}<atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`
}
