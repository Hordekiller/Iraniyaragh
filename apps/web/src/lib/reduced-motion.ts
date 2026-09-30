import { useEffect, useState } from 'react'

/**
 * Whether the customer has asked the system to reduce motion.
 *
 * Smooth scrolling is a large involuntary movement, so WCAG 2.3.3 asks that it
 * be droppable. `scroll-behavior: smooth` in CSS has no per-element opt-out, so
 * the two places that scroll programmatically check this first.
 *
 * `matchMedia` is read on every call rather than cached: a customer can change
 * the setting while the page is open.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `behavior` for `scrollTo`/`scrollBy` calls, honouring the OS setting. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

/**
 * React binding for the same signal, for components that animate rather than
 * scroll. It subscribes instead of polling, so a customer toggling the OS
 * setting mid-session is respected without a reload.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    // Safari below 14 only has the deprecated listener API. Anything that has
    // neither is simply not subscribed to — the first-render value still holds.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    }
    if (typeof query.addListener === 'function') {
      query.addListener(onChange)
      return () => query.removeListener(onChange)
    }
  }, [])

  return reduced
}
