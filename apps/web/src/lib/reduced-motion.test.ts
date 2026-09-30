import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { prefersReducedMotion, usePrefersReducedMotion } from './reduced-motion'

type Listener = () => void

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>()
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
  }
  const original = window.matchMedia
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList) as unknown as typeof window.matchMedia
  return {
    query,
    flip(next: boolean) {
      query.matches = next
      act(() => listeners.forEach(listener => listener()))
    },
    restore() {
      window.matchMedia = original
    },
  }
}

describe('prefersReducedMotion', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  it('reads the current OS setting on every call', () => {
    const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia

    expect(prefersReducedMotion()).toBe(true)
    expect(prefersReducedMotion()).toBe(true)
    // A customer can change the setting without reloading, so the value must not
    // be captured once at module load.
    expect(matchMedia).toHaveBeenCalledTimes(2)
  })

  it('assumes motion is fine when matchMedia is unavailable', () => {
    const saved = window.matchMedia
    // @ts-expect-error deliberately removing the API to model an old runtime
    delete window.matchMedia
    expect(prefersReducedMotion()).toBe(false)
    window.matchMedia = saved
  })
})

describe('usePrefersReducedMotion', () => {
  let media: ReturnType<typeof stubMatchMedia>

  beforeEach(() => {
    media = stubMatchMedia(false)
  })

  afterEach(() => {
    media.restore()
  })

  it('follows the setting while the component stays mounted', () => {
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)

    media.flip(true)
    expect(result.current).toBe(true)

    media.flip(false)
    expect(result.current).toBe(false)
  })

  it('reports the reduced state on the very first render', () => {
    media.restore()
    media = stubMatchMedia(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    // Waiting a tick here would flash the animated version at someone who asked
    // for no motion.
    expect(result.current).toBe(true)
  })
})
