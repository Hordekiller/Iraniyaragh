'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { ProductCarousel } from '../product/ProductCarousel'
import { useCatalogApi } from '../../state/catalog-context'
import { recentProductSlugs, subscribeRecentProducts } from '../../lib/recent-products'
import type { CatalogProduct } from '../../services/catalog/types'

export function RecentlyViewed({ title = "بازدیدهای اخیر شما", limit = 8 }: { title?: string; limit?: number } = {}) {
  const api = useCatalogApi()
  const key = useSyncExternalStore(subscribeRecentProducts, () => recentProductSlugs().join('|'), () => '')
  const [products, setProducts] = useState<CatalogProduct[]>([])
  useEffect(() => {
    let cancelled = false
    const slugs = key ? key.split('|') : []
    void (slugs.length ? api.listProducts({ slugs, perPage: 8 }) : Promise.resolve({ items: [] })).then(result => {
      if (!cancelled) setProducts(slugs.flatMap(slug => result.items.filter(item => item.slug === slug)))
    }, () => { if (!cancelled) setProducts([]) })
    return () => { cancelled = true }
  }, [api, key])
  return products.length ? <ProductCarousel id="shop-recent" title={title} products={products.slice(0, limit)} /> : null
}
