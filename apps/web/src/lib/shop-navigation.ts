import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const KEY = 'iranyaragh:navigation-mode'
const SHOP_ROOTS = ['/shop', '/catalog', '/categories', '/products', '/product', '/brands', '/search', '/bestsellers', '/cart', '/checkout', '/wishlist']
const SHARED_ROOTS = ['/account', '/orders', '/payment', '/payment-return']
const within = (pathname: string, roots: string[]) => roots.some(root => pathname === root || pathname.startsWith(`${root}/`))

export function navigationMode(pathname: string, saved: 'shop' | 'general'): 'shop' | 'general' {
  if (within(pathname, SHOP_ROOTS)) return 'shop'
  if (within(pathname, SHARED_ROOTS)) return saved
  return 'general'
}

/** Session storage retains the user's site context across login and payment redirects. */
export function useShopNavigation(): boolean {
  const { pathname } = useLocation()
  const [mode, setMode] = useState<'shop' | 'general'>('general')
  const previous = useRef<'shop' | 'general'>('general')
  useEffect(() => {
    let saved: 'shop' | 'general' = previous.current
    try { saved = window.sessionStorage.getItem(KEY) === 'shop' ? 'shop' : 'general' } catch { /* Storage can be disabled. */ }
    const next = navigationMode(pathname, saved)
    previous.current = next
    try { window.sessionStorage.setItem(KEY, next) } catch { /* Keep current in-memory context. */ }
    setMode(next)
  }, [pathname])
  return navigationMode(pathname, mode) === 'shop'
}
