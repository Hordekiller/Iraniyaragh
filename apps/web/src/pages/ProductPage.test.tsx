import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { CatalogProvider } from '../state/CatalogProvider'
import { ToastProvider } from '../components/feedback/Toast'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import { CatalogError } from '../services/catalog/errors'
import type { CartLine, CartState } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'
import type { CatalogApi, CatalogProduct } from '../services/catalog/types'
import { ProductPage } from './ProductPage'

class MemoryCartStorage implements CartStorage {
  state: CartState
  constructor(lines: CartLine[] = []) {
    this.state = { lines: lines.map(line => ({ ...line })) }
  }
  read(): CartState {
    return { lines: this.state.lines.map(line => ({ ...line })) }
  }
  write(next: CartState): void {
    this.state = { lines: next.lines.map(line => ({ ...line })) }
  }
}

const cartLineFor = (product: CatalogProduct): CartLine => {
  const variant =
    product.variants.find(v => v.id === product.defaultVariantId) ?? product.variants[0]
  return {
    variantId: variant.id,
    productId: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    image: product.image,
    sku: variant.sku,
    unitPrice: variant.salePrice,
    oldPrice: product.oldPrice,
    quantity: 1,
    available: null,
  }
}

function stubCatalog(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => []),
    listBrands: vi.fn(async () => []),
    listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
    getProductBySlug: vi.fn(async () => new CatalogFixtureClient({ delayMs: 0 }).getProductBySlug('ronix-2210-hammer-drill')),
    ...overrides,
  }
}

function renderProduct(slug: string, api: CatalogApi, storage: CartStorage = new MemoryCartStorage([])) {
  return render(
    <MemoryRouter initialEntries={[`/product/${slug}`]}>
      <Routes>
        <Route
          path="/product/:slug"
          element={
            <ToastProvider>
              <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
                <CatalogProvider api={api}>
                  <CartProvider storage={storage}>
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

describe('ProductPage', () => {
  it('renders the catalog product with its Persian data', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    expect(screen.getByText('در حال بارگذاری...')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })).toBeInTheDocument()
    expect(screen.getAllByText('Ronix').length).toBeGreaterThan(0)
    expect(screen.getAllByText('موجود در انبار').length).toBeGreaterThan(0)
    expect(screen.getByText('پرفروش هفته')).toBeInTheDocument()
    expect(screen.getByText('۲٬۸۵۰٬۰۰۰ تومان')).toBeInTheDocument()
    expect(screen.getByText('۴.۸')).toBeInTheDocument()
    expect(screen.getByText('(۳۴۲ نظر)')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'مسیر محصول' })).toHaveTextContent('ابزار برقی')
  })

  it('shows the not-found screen only when the API says the product is missing', async () => {
    const api = stubCatalog({
      getProductBySlug: vi.fn(async () => {
        throw new CatalogError({ code: 'NOT_FOUND', message: 'یافت نشد', statusCode: 404 })
      }),
    })
    renderProduct('does-not-exist', api)

    expect(await screen.findByRole('heading', { name: 'محصول یافت نشد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به فروشگاه' })).toHaveAttribute('href', '/')
  })

  it('offers a retry instead of claiming a failed product does not exist', async () => {
    const real = await new CatalogFixtureClient({ delayMs: 0 }).getProductBySlug('ronix-2210-hammer-drill')
    const getProductBySlug = vi
      .fn<() => Promise<typeof real>>()
      .mockRejectedValueOnce(new CatalogError({ code: 'UPSTREAM_UNAVAILABLE', message: 'ارتباط برقرار نشد.' }))
      .mockResolvedValue(real)
    const api = stubCatalog({ getProductBySlug })
    renderProduct('ronix-2210-hammer-drill', api)

    // A dropped connection is not proof the product was removed from the catalog.
    expect(await screen.findByRole('heading', { name: 'محصول بارگذاری نشد' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'محصول یافت نشد' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('heading', { name: real.name })).toBeInTheDocument()
  })

  it('adds the product to the cart from a fresh state and shows a toast', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const storage = new MemoryCartStorage([])
    renderProduct('bosch-gws-750-grinder', api, storage)

    fireEvent.click(await screen.findByRole('button', { name: 'افزودن به سبد خرید' }))

    expect(storage.state.lines).toHaveLength(1)
    expect(storage.state.lines[0].productId).toBe('p-102')
    expect(await screen.findByRole('status')).toHaveTextContent('به سبد خرید افزوده شد')
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeInTheDocument()
  })

  it('renders a quantity stepper for a product already in the cart', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const product = await api.getProductBySlug('ronix-2210-hammer-drill')
    const storage = new MemoryCartStorage([cartLineFor(product)])
    renderProduct(product.slug, api, storage)

    await screen.findByRole('heading', { name: product.name })

    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeInTheDocument()
    expect(screen.getByLabelText('۱')).toBeInTheDocument()
  })

  it('adjusts the quantity from the stepper', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const product = await api.getProductBySlug('ronix-2210-hammer-drill')
    const storage = new MemoryCartStorage([cartLineFor(product)])
    renderProduct(product.slug, api, storage)

    await screen.findByRole('heading', { name: product.name })

    fireEvent.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    expect(storage.state.lines[0].quantity).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'کاهش تعداد' }))
    expect(storage.state.lines[0].quantity).toBe(1)
  })

  it('states that shipping is decided at checkout instead of quoting a price', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('hans-24pc-socket-set', api)

    expect(await screen.findByText('هزینه ارسال در مرحله نهایی سفارش محاسبه می‌شود.')).toBeInTheDocument()
    expect(screen.getByText('موجودی و قیمت در لحظه ثبت سفارش بررسی می‌شود.')).toBeInTheDocument()
    expect(screen.queryByText('ارسال رایگان')).not.toBeInTheDocument()
    expect(screen.queryByText(/ارسال ۴۵٬۰۰۰ تومان/)).not.toBeInTheDocument()
    expect(screen.queryByText('ضمانت اصالت کالا')).not.toBeInTheDocument()
  })

  it('shows the discount badge and percentage when an old price exists', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })

    expect(screen.getByText(/٪۱۷ تخفیف/)).toBeInTheDocument()
  })

  it('disables the add button for an out-of-stock product', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const storage = new MemoryCartStorage([])
    renderProduct('dewalt-20v-chainsaw', api, storage)

    const addButton = await screen.findByRole('button', { name: 'ناموجود' })
    expect(addButton).toBeDisabled()
    expect(screen.getAllByText('ناموجود').length).toBeGreaterThanOrEqual(2)

    fireEvent.click(addButton)
    expect(storage.state.lines).toHaveLength(0)
  })

  it('navigates to the cart page from the side action', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })

    expect(screen.getByRole('button', { name: 'مشاهده سبد' })).toBeInTheDocument()
  })

  it('renders the ordered media gallery with the ready primary first', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    expect(await screen.findByAltText('دریل چکشی رونیکس ۲۲۱۰ از نمای جلو')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'عکس ۲' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ویدیو ۳' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'عکس ۴' })).toBeInTheDocument()
  })

  it('emits truthful Product and VideoObject structured data without invented fields', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })

    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    expect(scripts.length).toBeGreaterThanOrEqual(1)

    const nodes = scripts.flatMap(script => JSON.parse(script.textContent ?? '[]'))
    const productData = nodes.find(node => node['@type'] === 'Product')
    const videoData = nodes.find(node => node['@type'] === 'VideoObject')

    expect(productData).toMatchObject({ name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })
    expect(productData.image.length).toBeGreaterThan(0)
    expect(videoData).toMatchObject({ name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰ — ویدیو' })
    expect(videoData.duration).toBe('PT183S')
    expect(videoData.uploadDate).toBeUndefined()
  })

  it('cannot break out of the inline JSON-LD script with catalog-controlled text', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    vi.spyOn(api, 'getProductBySlug').mockResolvedValue({
      ...(await api.getProductBySlug('ronix-2210-hammer-drill')),
      name: '</script><img src=x onerror=alert(1)>RONIX',
    })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: /RONIX/ })

    const script = document.querySelector('script[type="application/ld+json"]')
    const raw = script?.textContent ?? ''
    // The only `</script>` in the document is the element's own closing tag.
    expect(raw.toLowerCase().split('</script>')).toHaveLength(1)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    // Still valid JSON that round-trips to the original string.
    const nodes = JSON.parse(raw) as Array<Record<string, unknown>>
    expect(nodes.find(node => node['@type'] === 'Product')?.name).toBe('</script><img src=x onerror=alert(1)>RONIX')
  })

  it('omits structured data for products without ready media', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('hans-24pc-socket-set', api)

    await screen.findByRole('heading', { name: 'ست آچار بکس ۲۴ پارچه هنس' })

    expect(document.querySelector('script[type="application/ld+json"]')).not.toBeInTheDocument()
  })

  it('renders the specification table from delivered fields only', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    const specs = await screen.findByRole('region', { name: 'مشخصات کالا' })
    expect(specs).toHaveTextContent('برند')
    expect(specs).toHaveTextContent('Ronix')
    expect(specs).toHaveTextContent('دسته‌بندی')
    expect(specs).toHaveTextContent('ابزار برقی')
    expect(specs).toHaveTextContent('کد کالا (SKU)')
    expect(specs).toHaveTextContent('SKU-ronix-2210-hammer-drill')
    expect(specs).toHaveTextContent('وزن بسته')
    expect(specs).toHaveTextContent('۳٫۲ کیلوگرم')
    // Availability is stated once, by the stock badge, not duplicated as a spec row.
    expect(specs).not.toHaveTextContent('وضعیت موجودی')
    // Single-variant products do not claim a variant count.
    expect(specs).not.toHaveTextContent('تعداد تنوع‌های فعال')
  })

  it('lists every active variant in the variants table and selects one', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const storage = new MemoryCartStorage([])
    renderProduct('tosan-50l-compressor', api, storage)

    const table = await screen.findByRole('region', { name: /تنوع‌های این کالا/ })
    expect(table).toHaveTextContent('۳ تنوع فعال')
    expect(within(table).getByRole('button', { name: /۲۴ لیتری/ })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: /۱۰۰ لیتری/ })).toBeInTheDocument()
    // The out-of-stock SKU is visibly marked and cannot be added to the cart.
    expect(within(table).getByText('ناموجود')).toBeInTheDocument()
    fireEvent.click(within(table).getByRole('button', { name: /۱۰۰ لیتری/ }))
    expect(await screen.findByRole('button', { name: 'ناموجود' })).toBeDisabled()
    expect(storage.state.lines).toHaveLength(0)

    fireEvent.click(within(table).getByRole('button', { name: /۲۴ لیتری/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن به سبد خرید' }))
    expect(storage.state.lines[0].sku).toBe('VR-P106-24')
  })

  it('shows the full catalog description and a lead derived from it', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    const description = await screen.findByRole('region', { name: 'توضیحات محصول' })
    const full = 'دریل چکشی ۱۳ میلی‌متری با موتور قدرتمند و سرعت متغیر برای سوراخ‌کاری روی فلز، چوب و بتن.'
    expect(description).toHaveTextContent(full)

    // The lead is the same catalog text, rendered once in the buy column.
    const leads = screen.getAllByText(full)
    expect(leads).toHaveLength(2)
    expect(leads.filter(node => node.tagName === 'P')).toHaveLength(1)
  })

  it('builds the breadcrumb from the live category list and links siblings', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('bosch-gws-750-grinder', api)

    const breadcrumb = await screen.findByRole('navigation', { name: 'مسیر محصول' })
    expect(breadcrumb).toHaveTextContent('خانه')
    expect(within(breadcrumb).getByRole('link', { name: 'ابزار برقی' })).toHaveAttribute('href', '/category/power-tools')

    const related = await screen.findByRole('region', { name: 'کالاهای همین دسته' })
    expect(within(related).getAllByRole('link').length).toBeGreaterThan(0)
    expect(within(related).queryByText('مینی فرز ۱۱۵ میلی‌متر بوش GWS 750')).not.toBeInTheDocument()
  })

  it('sets indexable product metadata and structured offers', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })

    await waitFor(() => expect(document.title).toBe('دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰ | ایران یراق'))
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('دریل چکشی ۱۳ میلی‌متری')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/product/ronix-2210-hammer-drill')

    const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap(script => JSON.parse(script.textContent ?? '[]'))
    const productData = nodes.find(node => node['@type'] === 'Product')
    expect(productData.brand).toEqual({ '@type': 'Brand', name: 'Ronix' })
    expect(productData.offers).toMatchObject({ priceCurrency: 'IRR', availability: 'https://schema.org/InStock' })
    expect(productData.aggregateRating).toBeUndefined()
  })
})