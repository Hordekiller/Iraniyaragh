import { describe, expect, it } from 'vitest'
import type { PublicReviewList } from '@iranyaragh/contracts'
import { productStructuredData } from './product-json-ld'
import type { CatalogProduct } from '../services/catalog/types'

const variant = { id: 'v', sku: 'S1', title: 'v', price: { amount: '1000', currency: 'IRR' }, stockStatus: 'IN_STOCK', attributes: [], isActive: true }
const product = { id: 'p', slug: 'p', name: 'کالا', brand: null, category: null, media: [], variants: [variant], description: null, price: variant.price, priceAvailable: true, oldPrice: null, rating: null, reviews: 0, stockStatus: 'IN_STOCK', badge: null, image: '' } as unknown as CatalogProduct
const reviews: PublicReviewList = {
  summary: { count: 2, average: 4.5, counts: [0, 0, 0, 1, 1] },
  items: [{ id: 'r', rating: 5, title: 'عالی', body: 'بسیار خوب بود', authorName: 'احمد ر.', verifiedPurchase: true, publishedAt: '2026-11-01T10:00:00.000Z', staffReply: null, staffRepliedAt: null }],
  meta: { page: 1, pages: 1, total: 2, perPage: 10 },
}

describe('product rating structured data', () => {
  it('emits aggregateRating and reviews only from real approved data', () => {
    const data = productStructuredData(product, 'https://x/products/p', '', undefined, undefined, reviews) as Record<string, unknown>
    expect(data.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 })
    expect((data.review as unknown[]).length).toBe(1)
  })
  it('emits no rating markup without reviews', () => {
    for (const none of [null, { ...reviews, summary: { count: 0, average: null, counts: [0, 0, 0, 0, 0] as [number, number, number, number, number] }, items: [] }]) {
      const data = productStructuredData(product, 'https://x/products/p', '', undefined, undefined, none) as Record<string, unknown>
      expect(data).not.toHaveProperty('aggregateRating')
      expect(data).not.toHaveProperty('review')
    }
  })
})
