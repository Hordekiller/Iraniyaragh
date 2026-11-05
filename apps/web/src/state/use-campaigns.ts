import { useContext, useEffect, useState } from 'react'
import type { PublicPromotion } from '@iranyaragh/contracts'
import { CartContext } from './cart-context'

const cache = new WeakMap<object, Promise<PublicPromotion[]>>()

/** Public campaigns, fetched once per API client; failures degrade to "no badges". */
export function useCampaigns(): PublicPromotion[] {
  const api = useContext(CartContext)?.api
  const [items, setItems] = useState<PublicPromotion[]>([])
  useEffect(() => {
    if (!api) return
    let active = true
    let pending = cache.get(api)
    if (!pending) {
      pending = api.getPublicPromotions().catch(() => [])
      cache.set(api, pending)
    }
    void pending.then((value) => { if (active) setItems(value) })
    return () => { active = false }
  }, [api])
  return items
}
