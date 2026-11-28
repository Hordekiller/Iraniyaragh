'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { shopEvent } from '../analytics/shop-events'
import { publicAnalyticsPath } from '../analytics/analytics-policy'
export function ShopTelemetry() {
  const pathname = usePathname()
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a')
      if (!anchor) return
      const product = anchor.closest<HTMLElement>('[data-shop-product]')
      if (product && pathname !== '/') { shopEvent('select_item', { items: [{ item_id: product.dataset.shopProduct! }], item_list_id: product.closest<HTMLElement>('[data-shop-list]')?.dataset.shopList }); return }
      const promo = anchor.closest<HTMLElement>('[data-shop-promotion]')
      if (promo && pathname === '/shop') { shopEvent('select_promotion', { promotion_id: promo.dataset.shopPromotion }); return }
      const url = new URL(anchor.href)
      const destination = publicAnalyticsPath(url.pathname)
      if (url.origin === window.location.origin && destination && (url.pathname === '/shop' || pathname === '/shop')) shopEvent('shop_navigation', { destination })
    }
    document.addEventListener('click', click)
    return () => document.removeEventListener('click', click)
  }, [pathname])
  return null
}
