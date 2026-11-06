'use client'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
const PrivateRoutes = lazy(() => import('./PrivateRoutes'))
const loading = <p role="status" className="p-8 text-center">در حال بارگذاری…</p>

/**
 * Client-only journey shell. `intro` is server-rendered, crawlable content that
 * stays in the initial HTML and is shown until the interactive view replaces it.
 */
export function PrivateJourney({ intro }: { intro?: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- gate the client-only bundle behind hydration
  useEffect(() => setMounted(true), [])
  const fallback = intro ?? loading
  return mounted ? <Suspense fallback={fallback}><PrivateRoutes /></Suspense> : fallback
}
