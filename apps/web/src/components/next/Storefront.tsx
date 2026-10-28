'use client'

import { useMemo, type ReactNode } from 'react'
import { Router, createPath, type Navigator, Routes, Route } from 'react-router-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ToastProvider } from '../feedback/Toast'
import { AuthProvider } from '../../state/AuthProvider'
import { CatalogProvider } from '../../state/CatalogProvider'
import { CartProvider } from '../../state/CartProvider'
import { AppLayout } from '../layout/AppLayout'
import { ProductPage } from '../../views/ProductPage'
import type { CatalogProduct } from '../../services/catalog/types'

/** Next owns navigation and server data; the existing customer islands keep their router contract. */
export function Storefront({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const navigator = useMemo<Navigator>(() => ({
    createHref: to => typeof to === 'string' ? to : createPath(to),
    go: delta => window.history.go(delta),
    push: (to, state) => router.push((typeof to === 'string' ? to : createPath(to)) + (state?.scrollToCategories ? '#categories' : '')),
    replace: to => router.replace(typeof to === 'string' ? to : createPath(to)),
  }), [router])
  return <Router location={{ pathname, search: search ? `?${search}` : '', hash: '' }} navigator={navigator}>
    <ToastProvider><AuthProvider><CatalogProvider><CartProvider>
      <AppLayout serverMetadata>{children}</AppLayout>
    </CartProvider></CatalogProvider></AuthProvider></ToastProvider>
  </Router>
}

export function ProductIsland({ product }: { product: CatalogProduct }) {
  return <Routes><Route path="/products/:slug" element={<ProductPage initialProduct={product} serverStructuredData />} /></Routes>
}
