import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlogPublicPost } from '@iranyaragh/contracts'
import { buildFeed } from './blog-feed'
import { metadataFor } from './policy'
import { articleJsonLd, blogIndexJsonLd } from './structured-data'

afterEach(() => vi.unstubAllEnvs())
const origin = 'https://iraniyaragh.com'
const setup = () => { vi.stubEnv('PUBLIC_WEB_ORIGIN', origin); vi.stubEnv('APP_ENVIRONMENT', 'production') }
const post: BlogPublicPost = {
  slug: 'راهنمای-لولا', title: 'راهنمای انتخاب لولا', excerpt: 'خلاصهٔ مقاله & «نقل‌قول»', cover: { url: 'https://media.test/a.webp', width: 1200, height: 630, alt: 'لولا' }, tags: ['لولا', 'کابینت'],
  publishedAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-03T08:00:00.000Z', readingMinutes: 3, bodyHtml: '<p>متن</p>',
  sources: [{ title: 'منبع', url: 'https://example.com/s', accessedAt: '2026-11-01' }], seoTitle: null, seoDescription: null,
}

describe('blog structured data', () => {
  it('describes the article with real dates, the store as author and no staff names', () => {
    setup()
    const schema = articleJsonLd(post, 420)
    expect(schema).toMatchObject({ '@type': 'BlogPosting', url: `${origin}/blog/${encodeURIComponent(post.slug)}`, datePublished: post.publishedAt, dateModified: post.updatedAt, inLanguage: 'fa-IR', wordCount: 420, image: [post.cover!.url] })
    expect(schema.author['@type']).toBe('Organization')
    expect(schema.citation).toEqual([{ '@type': 'CreativeWork', name: 'منبع', url: 'https://example.com/s' }])
    expect(schema.keywords).toBe('لولا، کابینت')
  })
  it('caps the headline at 110 characters and omits empty image/citation/keywords', () => {
    setup()
    const schema = articleJsonLd({ ...post, title: 'ا'.repeat(200), cover: null, sources: [], tags: [] }, 10)
    expect([...schema.headline]).toHaveLength(110)
    for (const key of ['image', 'citation', 'keywords']) expect(schema).not.toHaveProperty(key)
  })
  it('numbers the index ItemList from the page offset', () => {
    setup()
    const list = blogIndexJsonLd([post], '/blog?page=2', 12)
    expect(list.mainEntity.itemListElement[0]).toMatchObject({ position: 13, url: `${origin}/blog/${encodeURIComponent(post.slug)}` })
  })
})

describe('blog metadata and feed', () => {
  it('marks articles as og:article with times and tags, and advertises the RSS feed', () => {
    setup()
    const meta = metadataFor({ title: post.title, description: post.excerpt, path: '/blog/x', image: post.cover!.url, rss: true, article: { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, tags: post.tags } })
    expect(meta.openGraph).toMatchObject({ type: 'article', publishedTime: post.publishedAt, modifiedTime: post.updatedAt, tags: post.tags })
    expect(meta.alternates).toMatchObject({ canonical: `${origin}/blog/x`, types: { 'application/rss+xml': `${origin}/blog/feed.xml` } })
    expect(metadataFor({ title: 't', description: 'd', path: '/blog' }).alternates).not.toHaveProperty('types')
  })
  it('builds a well-formed RSS 2.0 feed with escaped text and RFC 822 dates', () => {
    const xml = buildFeed({ title: 'T & Co', link: `${origin}/blog`, self: `${origin}/blog/feed.xml`, description: 'd', origin, posts: [{ slug: post.slug, title: '<b>x</b>', excerpt: post.excerpt, cover: null, tags: ['a&b'], publishedAt: post.publishedAt, updatedAt: post.updatedAt, readingMinutes: 1 }] })
    expect(xml).toContain('<title>T &amp; Co</title>')
    expect(xml).toContain('<title>&lt;b&gt;x&lt;/b&gt;</title>')
    expect(xml).toContain('<pubDate>Sun, 01 Nov 2026 08:00:00 GMT</pubDate>')
    expect(xml).toContain(`<guid isPermaLink="true">${origin}/blog/${encodeURIComponent(post.slug)}</guid>`)
    expect(xml).toContain('<category>a&amp;b</category>')
    expect(xml).not.toMatch(/<b>/u)
  })
  it('emits an empty channel without lastBuildDate when nothing is published', () => {
    const xml = buildFeed({ title: 'T', link: origin, self: origin, description: 'd', origin, posts: [] })
    expect(xml).not.toContain('<item>'); expect(xml).not.toContain('lastBuildDate')
  })
})
