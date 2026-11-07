import 'server-only'
import { cache } from 'react'
import type { PublicReviewList, PublicReviewListResponse } from '@iranyaragh/contracts'
import { publicJson } from './catalog'

function isolatedFixture() { return process.env.APP_ENVIRONMENT === 'test' && process.env.NEXT_PUBLIC_FIXTURE_CATALOG === 'true' }
/**
 * First page of approved reviews for the product page and its structured data. Best effort: a
 * reviews outage must never take the product page (and its checkout path) down, and a fixture
 * environment has no real reviews, so nothing is invented.
 */
export const productReviews = cache(async (slug: string): Promise<PublicReviewList | null> => {
  if (isolatedFixture()) return null
  try { return (await publicJson<PublicReviewListResponse>(`/api/v1/reviews/products/${encodeURIComponent(slug)}?page=1&sort=newest`)).data } catch { return null }
})
