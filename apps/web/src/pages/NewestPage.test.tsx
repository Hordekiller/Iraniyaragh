import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NewestPage } from './NewestPage'
import { CatalogProvider } from '../state/CatalogProvider'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import type { CatalogApi } from '../services/catalog/types'

function renderPage() {
  return render(
    <MemoryRouter>
      <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
        <NewestPage />
      </CatalogProvider>
    </MemoryRouter>,
  )
}

function renderUnavailablePage() {
  const unavailable: CatalogApi = {
    listCategories: () => Promise.reject(new Error('catalog down')),
    listBrands: () => Promise.reject(new Error('catalog down')),
    listProducts: () => Promise.reject(new Error('catalog down')),
    getProductBySlug: () => Promise.reject(new Error('catalog down')),
  }
  return render(
    <MemoryRouter>
      <CatalogProvider api={unavailable}>
        <NewestPage />
      </CatalogProvider>
    </MemoryRouter>,
  )
}

describe('NewestPage', () => {
  it('renders a heading and lists catalog products', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'تازه‌ترین کالاها' })).toBeInTheDocument()

    const links = await screen.findAllByRole('link', { name: /تومان/ })
    expect(links.length).toBeGreaterThan(0)

    expect(screen.queryByText('در حال بارگذاری محصولات...')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the total from the fixture response metadata', async () => {
    renderPage()

    // Persian digits: the count is the API's meta.total, not the rendered length.
    expect(await screen.findByText(/^[۰-۹]+ کالا$/)).toBeInTheDocument()
  })

  it('never claims a sales ranking the public catalog cannot serve', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'تازه‌ترین کالاها' })).toBeInTheDocument()
    expect(screen.queryByText(/پرفروش/)).not.toBeInTheDocument()
  })

  it('shows a Persian error state when the catalog call fails', async () => {
    renderUnavailablePage()

    expect(await screen.findByRole('alert')).toHaveTextContent('بارگذاری محصولات با خطا مواجه شد.')
    expect(screen.getByRole('heading', { name: 'تازه‌ترین کالاها' })).toBeInTheDocument()
  })
})