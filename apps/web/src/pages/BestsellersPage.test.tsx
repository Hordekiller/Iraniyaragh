import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BestsellersPage } from './BestsellersPage'
import { CatalogProvider } from '../state/CatalogProvider'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import type { CatalogApi } from '../services/catalog/types'

function renderPage() {
  return render(
    <MemoryRouter>
      <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
        <BestsellersPage />
      </CatalogProvider>
    </MemoryRouter>,
  )
}

function renderUnavailablePage() {
  const unavailable: CatalogApi = {
    listCategories: () => Promise.reject(new Error('catalog down')),
    listProducts: () => Promise.reject(new Error('catalog down')),
    getProductBySlug: () => Promise.reject(new Error('catalog down')),
  }
  return render(
    <MemoryRouter>
      <CatalogProvider api={unavailable}>
        <BestsellersPage />
      </CatalogProvider>
    </MemoryRouter>,
  )
}

describe('BestsellersPage', () => {
  it('renders a heading and lists catalog products', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'پرفروش‌ترین‌ها' })).toBeInTheDocument()

    const links = await screen.findAllByRole('link', { name: /تومان/ })
    expect(links.length).toBeGreaterThan(0)

    expect(screen.queryByText('در حال بارگذاری...')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the product count matching the fixture response', async () => {
    renderPage()

    const count = await screen.findByText(/کالا/)
    expect(count.textContent).toMatch(/کالا/)
  })

  it('shows a Persian error state when the catalog call fails', async () => {
    renderUnavailablePage()

    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت پرفروش‌ها با خطا مواجه شد.')
    expect(screen.getByRole('heading', { name: 'پرفروش‌ترین‌ها' })).toBeInTheDocument()
  })
})