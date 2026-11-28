'use client'
import { useEffect, useRef, useState } from 'react'
import type { CatalogProduct, CatalogQuery } from '../../services/catalog/types'
import { useCatalogApi } from '../../state/catalog-context'
import { ProductCarousel } from '../product/ProductCarousel'
/** Offscreen collections are loaded independently, within a small viewport margin. */
export function ShopProducts({ id, title, description, query, href, offer = false }: { id: string; title: string; description: string; query: CatalogQuery; href: string; offer?: boolean }) {
  const target = useRef<HTMLDivElement>(null)
  const api = useCatalogApi()
  const [visible, setVisible] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; products: CatalogProduct[] }>({ status: 'loading', products: [] })
  const queryKey = JSON.stringify(query)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '300px' })
    if (target.current) observer.observe(target.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let active = true
    void api.listProducts(JSON.parse(queryKey) as CatalogQuery).then(result => { if (active) setState({ status: 'ready', products: result.items }) }, () => { if (active) setState({ status: 'error', products: [] }) })
    return () => { active = false }
  }, [api, queryKey, visible, attempt])
  return <div ref={target}>{state.status === 'ready' && !state.products.length ? null : <ProductCarousel id={id} title={title} description={description} products={state.products} moreHref={href} variant={offer ? 'offer' : 'default'} status={state.status} onRetry={() => { setState({ status: 'loading', products: [] }); setAttempt(value => value + 1) }} />}</div>
}
