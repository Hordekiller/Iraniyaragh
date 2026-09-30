import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NotFoundPage } from './NotFoundPage'
import { ROUTES } from '../lib/routes'

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  )
}

describe('NotFoundPage', () => {
  it('is hidden from search engines and states the truth', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'صفحه‌ای پیدا نشد' })).toBeInTheDocument()
    // A 404 must never be indexed, and the tab title must say so rather than
    // borrowing a real page's name.
    expect(document.title).toContain('صفحه یافت نشد')
    const robots = document.head.querySelector('meta[name="robots"]')
    expect(robots?.getAttribute('content')).toContain('noindex')
  })

  it('offers a way back home and a way to search instead of a dead end', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /بازگشت به صفحه اصلی/ })).toHaveAttribute('href', ROUTES.home)
    expect(screen.getByRole('link', { name: /جست‌وجو در فروشگاه/ })).toHaveAttribute('href', ROUTES.search)
  })

  it('points at every real storefront destination so a bad link is recoverable', () => {
    renderPage()

    const nav = screen.getByRole('navigation', { name: 'مقصدهای پیشنهادی' })
    expect(nav).toBeInTheDocument()
    for (const [name, href] of [
      ['دسته‌بندی کالاها', ROUTES.categories],
      ['همه کالاها', ROUTES.products],
      ['تازه‌های فروشگاه', ROUTES.newest],
      ['خدمات فروشگاه', ROUTES.services],
    ] as const) {
      expect(nav.querySelector(`a[href="${href}"]`)).not.toBeNull()
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('never links back to the not-found route', () => {
    renderPage()

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toBe('#')
      expect(link.getAttribute('href')).not.toContain('/no-such')
    }
  })
})
