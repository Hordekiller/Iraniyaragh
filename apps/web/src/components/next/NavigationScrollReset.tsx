'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/** Next's visibility heuristic can keep the old offset when the shared shell is visible. */
export function NavigationScrollReset() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const previousPath = useRef(pathname)
  const historyDestination = useRef<string | null>(null)

  useEffect(() => {
    const onPopState = () => { historyDestination.current = window.location.pathname + window.location.search }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useLayoutEffect(() => {
    const destination = pathname + (search ? `?${search}` : '')
    const isHistoryNavigation = historyDestination.current === destination
    historyDestination.current = null
    const changedPage = previousPath.current !== pathname
    previousPath.current = pathname
    // Preserve query/filter changes, fragment targets and browser history restoration.
    if (changedPage && !isHistoryNavigation && !window.location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [pathname, search])

  return null
}
