import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomePage } from './HomePage'
import { CatalogProvider } from '../state/CatalogProvider'
import { CatalogFixtureClient } from '../services/catalog/fixtures'

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
              <HomePage />
            </CatalogProvider>
          }
        />
        <Route path="/product/:slug" element={<span data-testid="product-probe">product</span>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('renders the hero, live category grid, newest products, services and the newsletter teaser', async () => {
    renderHome()

    expect(screen.getByRole('region', { name: 'اسلایدر دسته‌بندی‌های فروشگاه' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'دسته‌بندی تخصصی ابزار' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'تازه‌های فروشگاه' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'خدمات ایران یراق' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'عضو خبرنامه شوید' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'برندهای موجود' })).toBeInTheDocument()
  })

  it('navigates to the product page when a newest product is selected', async () => {
    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: /دریل چکشی ۱۳/ }))

    expect(screen.getByTestId('product-probe')).toBeInTheDocument()
  })
})