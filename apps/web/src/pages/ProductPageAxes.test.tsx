import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/feedback/Toast'
import { MemorySessionStore } from '../lib/auth/session-store'
import type { CatalogApi, CatalogProduct, CatalogVariant } from '../services/catalog/types'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { CatalogProvider } from '../state/CatalogProvider'
import { commerceStub, testAuthProps } from '../test/commerce'
import { ProductPage } from './ProductPage'

function variant(
  id: string,
  priceToman: number,
  values: Array<{ code: string; name: string; option: string; label: string }>,
): CatalogVariant {
  return {
    id,
    sku: `SKU-${id}`,
    title: null,
    price: { amount: String(priceToman * 10), currency: 'IRR' },
    stockStatus: 'IN_STOCK',
    weightGrams: null,
    attributes: values.map((value) => ({
      attributeCode: value.code,
      attributeName: value.name,
      optionCode: value.option,
      optionLabel: value.label,
      isVariantAxis: true,
    })),
  }
}

const hingeProduct: CatalogProduct = {
  id: 'p-hinge',
  slug: 'hinge-cabinet',
  name: 'لولا کابینتی',
  brand: null,
  category: null,
  image: '/images/tool1.jpg',
  media: [],
  axes: [
    {
      attributeCode: 'brand',
      attributeName: 'برند',
      sortOrder: 0,
      options: [
        { optionCode: 'b-amit', optionLabel: 'آمیت' },
        { optionCode: 'b-jasco', optionLabel: 'جاکو' },
      ],
    },
    {
      attributeCode: 'weight',
      attributeName: 'وزن',
      sortOrder: 1,
      options: [
        { optionCode: 'w-60', optionLabel: '۶۰ گرم' },
        { optionCode: 'w-90', optionLabel: '۹۰ گرم' },
      ],
    },
  ],
  variants: [
    variant('v-1', 120_000, [
      { code: 'brand', name: 'برند', option: 'b-amit', label: 'آمیت' },
      { code: 'weight', name: 'وزن', option: 'w-60', label: '۶۰ گرم' },
    ]),
    variant('v-2', 180_000, [
      { code: 'brand', name: 'برند', option: 'b-amit', label: 'آمیت' },
      { code: 'weight', name: 'وزن', option: 'w-90', label: '۹۰ گرم' },
    ]),
    variant('v-3', 150_000, [
      { code: 'brand', name: 'برند', option: 'b-jasco', label: 'جاکو' },
      { code: 'weight', name: 'وزن', option: 'w-60', label: '۶۰ گرم' },
    ]),
  ],
  description: null,
  price: { amount: '1200000', currency: 'IRR' },
  priceAvailable: true,
  oldPrice: null,
  rating: null,
  reviews: 0,
  stockStatus: 'IN_STOCK',
  badge: null,
}

function renderPageWithProduct(product: CatalogProduct) {
  const stub: CatalogApi = {
    getProductBySlug: vi.fn(async () => product),
    listCategories: vi.fn(async () => []),
    getHomepageCollections: vi.fn(async () => ({
      version: 0,
      sections: [],
      updatedAt: null,
    })),
    listProducts: vi.fn(async () => ({
      items: [],
      meta: { page: 1, perPage: 24, total: 0, pages: 0 },
    })),
  }
  return render(
    <MemoryRouter initialEntries={['/product/hinge-cabinet']}>
      <Routes>
        <Route
          path="/product/:slug"
          element={
            <ToastProvider>
              <AuthProvider {...testAuthProps(new MemorySessionStore())}>
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

describe('ProductPage cascading variant selector', () => {
  it('narrows the following axis to the choices the selected axis allows', async () => {
    renderPageWithProduct(hingeProduct)
    await screen.findByRole('heading', { name: 'لولا کابینتی' })

    const brand = await screen.findByLabelText('برند')
    const weight = screen.getByLabelText('وزن')
    expect(brand).toBeInTheDocument()
    expect(weight).toBeInTheDocument()

    // Every brand offers its own weights, so both weights start out visible.
    expect(screen.getByRole('option', { name: '۶۰ گرم' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '۹۰ گرم' })).toBeInTheDocument()

    // Jasco only exists in the 60 gram combination, so the weight axis narrows.
    fireEvent.change(brand, { target: { value: 'b-jasco' } })
    await waitFor(() =>
      expect(screen.getByRole('option', { name: '۶۰ گرم' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option', { name: '۹۰ گرم' })).not.toBeInTheDocument()
  })

  it('resolves the matching variant and its price', async () => {
    renderPageWithProduct(hingeProduct)
    await screen.findByRole('heading', { name: 'لولا کابینتی' })

    fireEvent.change(screen.getByLabelText('برند'), {
      target: { value: 'b-amit' },
    })
    fireEvent.change(screen.getByLabelText('وزن'), {
      target: { value: 'w-60' },
    })
    await waitFor(() =>
      expect(screen.getByText('۱۲۰٬۰۰۰ تومان')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('product-attributes')).toHaveTextContent('آمیت')
    expect(
      screen.getByRole('button', { name: 'افزودن به سبد خرید' }),
    ).toBeEnabled()
  })

  it('shows the lowest matching price until the selection is complete', async () => {
    renderPageWithProduct(hingeProduct)
    await screen.findByRole('heading', { name: 'لولا کابینتی' })

    fireEvent.change(screen.getByLabelText('برند'), {
      target: { value: 'b-amit' },
    })
    await waitFor(() =>
      expect(screen.getByText('از ۱۲۰٬۰۰۰ تومان')).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'گزینه‌ها را کامل انتخاب کنید' }),
    ).toBeDisabled()
  })

  it('keeps variants without a brand reachable through the unspecified choice', async () => {
    const product: CatalogProduct = {
      ...hingeProduct,
      variants: [
        ...hingeProduct.variants,
        variant('v-4', 90_000, [
          { code: 'weight', name: 'وزن', option: 'w-60', label: '۶۰ گرم' },
        ]),
      ],
    }
    renderPageWithProduct(product)
    await screen.findByRole('heading', { name: 'لولا کابینتی' })

    fireEvent.change(screen.getByLabelText('برند'), {
      target: { value: '__unspecified__' },
    })
    fireEvent.change(screen.getByLabelText('وزن'), {
      target: { value: 'w-60' },
    })
    await waitFor(() =>
      expect(screen.getByText('۹۰٬۰۰۰ تومان')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('product-attributes')).toHaveTextContent('نامشخص')
  })

  it('falls back to the flat variant chips when the product has no axes', async () => {
    const product: CatalogProduct = { ...hingeProduct, axes: [] }
    renderPageWithProduct(product)
    await screen.findByRole('heading', { name: 'لولا کابینتی' })

    expect(screen.queryByTestId('variant-axis-selector')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'آمیت / ۶۰ گرم' }),
    ).toBeInTheDocument()
  })
})
