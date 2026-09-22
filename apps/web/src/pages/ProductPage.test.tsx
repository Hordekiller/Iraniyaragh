import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/feedback/Toast'
import { MemorySessionStore } from '../lib/auth/session-store'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import { fixtureAllProducts } from '../services/catalog/fixture-data'
import type { CatalogApi, CatalogProduct } from '../services/catalog/types'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { CatalogProvider } from '../state/CatalogProvider'
import {
  CART,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'
import { ProductPage } from './ProductPage'

function renderPage(store = signedInStore(), commerce = commerceStub()) {
  return render(
    <MemoryRouter initialEntries={['/product/ronix-2210-hammer-drill']}>
      <Routes>
        <Route
          path="/product/:slug"
          element={
            <ToastProvider>
              <AuthProvider {...testAuthProps(store)}>
                <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
                  <CartProvider api={commerce}>
                    <ProductPage />
                  </CartProvider>
                </CatalogProvider>
              </AuthProvider>
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function renderPageWithProduct(product: CatalogProduct) {
  const stub: CatalogApi = {
    getProductBySlug: vi.fn(async () => product),
    listCategories: vi.fn(async () => []),
    listProducts: vi.fn(async () => ({
      items: [],
      meta: { page: 1, perPage: 24, total: 0, pages: 0 },
    })),
  }
  return render(
    <MemoryRouter initialEntries={['/product/ronix-2210-hammer-drill']}>
      <Routes>
        <Route
          path="/product/:slug"
          element={
            <ToastProvider>
              <AuthProvider {...testAuthProps(signedInStore())}>
                <CatalogProvider api={stub}>
                  <CartProvider api={commerceStub()}>
                    <ProductPage />
                  </CartProvider>
                </CatalogProvider>
              </AuthProvider>
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function drillWithDescription(
  description: string | null,
): CatalogProduct {
  return {
    ...fixtureAllProducts.find(
      (product) => product.slug === 'ronix-2210-hammer-drill',
    )!,
    description,
    media: [
      {
        id: 'media-1',
        kind: 'IMAGE' as const,
        position: 0,
        role: 'PRIMARY' as const,
        alt: 'دریل',
        caption: null,
        width: 1200,
        height: 900,
        sources: [
          { url: '/images/hero1.jpg', width: 1200, height: 900, type: 'image/jpeg' },
        ],
      },
    ],
  }
}

describe('ProductPage commerce', () => {
  it('adds the selected sellable variant, never the product id', async () => {
    const addLine = vi.fn(async () => await commerceStub().getCart('customer'))
    const api = commerceStub({ addLine })
    renderPage(signedInStore(), api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'افزودن به سبد خرید' }),
    )
    await waitFor(() =>
      expect(addLine).toHaveBeenCalledWith(
        'customer',
        'variant-p-101',
        1,
        expect.stringMatching(/^cart-/),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'به سبد خرید افزوده شد',
    )
  })
  it('adds to the real Guest Cart without forcing early authentication', async () => {
    const api = commerceStub()
    renderPage(new MemorySessionStore(), api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'افزودن به سبد خرید' }),
    )
    await waitFor(() =>
      expect(api.addLine).toHaveBeenCalledWith(
        'guest',
        'variant-p-101',
        1,
        expect.stringMatching(/^cart-/),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'به سبد خرید افزوده شد',
    )
  })
  it('does not claim success while the server Cart is still initializing', async () => {
    const api = commerceStub({
      getCart: vi.fn(() => new Promise<typeof CART>(() => undefined)),
    })
    renderPage(new MemorySessionStore(), api)

    expect(
      await screen.findByRole('button', { name: 'در حال آماده‌سازی سبد…' }),
    ).toBeDisabled()
    expect(screen.queryByText('به سبد خرید افزوده شد')).not.toBeInTheDocument()
    expect(api.addLine).not.toHaveBeenCalled()
  })
  it('describes shipping honestly', async () => {
    renderPage()
    expect(
      await screen.findByText('هزینه ارسال پس از ثبت آدرس محاسبه می‌شود'),
    ).toBeInTheDocument()
  })
})

describe('ProductPage rich description', () => {
  it('renders the sanitized description as markup, never escaped text', async () => {
    const { container } = renderPageWithProduct(
      drillWithDescription(
        '<h2>ویژگی‌های کلیدی</h2><p>موتور <strong>۱۸۰۰ وات</strong> و <a href="/p/accessories">لوازم جانبی</a></p>',
      ),
    )
    await waitFor(() =>
      expect(
        container.querySelector('[data-rich-text] h2'),
    ).toHaveTextContent(/ویژگی/),
    )
    expect(screen.getByRole('link', { name: 'لوازم جانبی' })).toHaveAttribute(
      'href',
      '/p/accessories',
    )
    expect(container.textContent).not.toContain('<h2>')
    expect(screen.getByText('۱۸۰۰ وات').tagName).toBe('STRONG')
  })

  it('stores a plain-text description in structured data, without markup', async () => {
    const { container } = renderPageWithProduct(
      drillWithDescription(
        '<h2>انتخاب هوشمند</h2><p>توضیح کوتاه و <strong>قابل اعتماد</strong>.</p>',
      ),
    )
    await screen.findByRole('heading', { name: 'انتخاب هوشمند' })
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    )
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.textContent ?? '[]') as Array<
      Record<string, unknown>
    >
    const productNode = data.find((node) => node['@type'] === 'Product')
    expect(productNode).toBeDefined()
    expect(productNode!.description).toBe(
      'انتخاب هوشمند توضیح کوتاه و قابل اعتماد.',
    )
    expect(String(productNode!.description)).not.toContain('<')
  })

  it('omits the structured-data description when the product has none', async () => {
    const { container } = renderPageWithProduct(drillWithDescription(null))
    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    )
    const data = [...scripts].flatMap((script) =>
      JSON.parse(script.textContent ?? '[]') as Array<Record<string, unknown>>,
    )
    const productNode = data.find((node) => node['@type'] === 'Product')
    expect(productNode?.description).toBeUndefined()
  })
})
