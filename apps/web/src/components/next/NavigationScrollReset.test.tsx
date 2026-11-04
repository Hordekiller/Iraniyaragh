import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationScrollReset } from './NavigationScrollReset'

const route = vi.hoisted(() => ({ pathname: '/', search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}))

describe('NavigationScrollReset', () => {
  beforeEach(() => {
    route.pathname = '/'
    route.search = ''
    window.history.replaceState(null, '', '/')
    window.scrollTo = vi.fn()
  })

  it('starts a new page at the top without scrolling on initial load', () => {
    const view = render(<NavigationScrollReset />)
    expect(window.scrollTo).not.toHaveBeenCalled()
    route.pathname = '/products/hinge'
    view.rerender(<NavigationScrollReset />)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('preserves scroll when only filters change', () => {
    const view = render(<NavigationScrollReset />)
    route.search = 'q=hinge'
    view.rerender(<NavigationScrollReset />)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('lets fragment navigation reach its target', () => {
    route.pathname = '/cart'
    const view = render(<NavigationScrollReset />)
    window.history.pushState(null, '', '/#categories')
    route.pathname = '/'
    view.rerender(<NavigationScrollReset />)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('preserves browser back/forward restoration', () => {
    const view = render(<NavigationScrollReset />)
    window.history.replaceState(null, '', '/cart')
    window.dispatchEvent(new PopStateEvent('popstate'))
    route.pathname = '/cart'
    view.rerender(<NavigationScrollReset />)
    expect(window.scrollTo).not.toHaveBeenCalled()
    route.pathname = '/checkout'
    view.rerender(<NavigationScrollReset />)
    expect(window.scrollTo).toHaveBeenCalledOnce()
  })
})
