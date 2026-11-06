import type { BlogPublicList, BlogPublicPost, BlogPublicPostResult, BlogPublicSummary } from '@iranyaragh/contracts'

/** Isolated test-environment articles. They are labelled as samples and never reach production sales or SEO. */
const image = '<figure><img data-media-id="sample" src="/images/tool1.jpg" width="940" height="627" alt="تصویر نمونهٔ آزمایشی ابزار" loading="lazy" decoding="async"><figcaption>تصویر نمونهٔ آزمایشی</figcaption></figure>'
const body = (topic: string) => `<h2>${topic}</h2>${image}<p>${'این متن نمونهٔ آزمایشی است و فقط در محیط تست برای بررسی ساختار صفحه به‌کار می‌رود. '.repeat(8)}</p><h2>جمع‌بندی</h2><p>${'محتوای نمونه برای سنجش ساختار عنوان‌ها، پیوندها و داده‌های ساخت‌یافته. '.repeat(6)}</p>`
const posts: BlogPublicPost[] = [
  { slug: 'sample-guide-one', title: 'نمونهٔ آزمایشی: راهنمای یک', excerpt: 'خلاصهٔ نمونهٔ آزمایشی برای بررسی صفحهٔ مقاله؛ این مطلب فقط در محیط تست نمایش داده می‌شود.', cover: { url: '/images/hero1.jpg', width: 940, height: 627, alt: 'تصویر شاخص نمونهٔ آزمایشی' }, tags: ['نمونه'], publishedAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z', readingMinutes: 2, bodyHtml: body('بخش اول'), sources: [{ title: 'منبع نمونه', url: 'https://example.com/source', accessedAt: '2026-11-01' }], seoTitle: null, seoDescription: null },
  { slug: 'sample-guide-two', title: 'نمونهٔ آزمایشی: راهنمای دو', excerpt: 'خلاصهٔ دومین مقالهٔ نمونهٔ آزمایشی برای بررسی فهرست مقاله‌ها در محیط تست و ساختار صفحه‌بندی.', cover: null, tags: ['نمونه'], publishedAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z', readingMinutes: 2, bodyHtml: body('بخش دوم'), sources: [], seoTitle: null, seoDescription: null },
]
const summary = (post: BlogPublicPost): BlogPublicSummary => ({ slug: post.slug, title: post.title, excerpt: post.excerpt, cover: post.cover, tags: post.tags, publishedAt: post.publishedAt, updatedAt: post.updatedAt, readingMinutes: post.readingMinutes })
export function fixtureBlogList(page: number): BlogPublicList {
  return { items: page === 1 ? posts.map(summary) : [], meta: { page, pages: 1, total: posts.length, perPage: 12 } }
}
export function fixtureBlogPost(slug: string): BlogPublicPostResult {
  return { post: posts.find(post => post.slug === slug) ?? null, redirectSlug: null }
}
