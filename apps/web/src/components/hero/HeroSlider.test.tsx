import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../feedback/Toast'
import { CatalogProvider } from '../../state/CatalogProvider'
import type { CatalogApi, CatalogCategory } from '../../services/catalog/types'
import { HeroSlider } from './HeroSlider'

const CATEGORIES: CatalogCategory[] = [
  { id: 'cat-1', name: 'ابزار برقی', slug: 'power-tools', parentId: null, productCount: 320, image: '/images/hero1.jpg' },
  { id: 'cat-2', name: 'ابزار دستی', slug: 'hand-tools', parentId: null, productCount: 480, image: '/images/hero2.jpg' },
  { id: 'cat-3', name: 'باغبانی', slug: 'garden', parentId: null, productCount: 180, image: '/images/tool3.jpg' },
]

const api: CatalogApi = {
  listCategories: vi.fn(async () => CATEGORIES),
  listBrands: vi.fn(async () => []),
  listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
  getProductBySlug: vi.fn(async () => { throw new Error('not used') }),
}

function Harness({ initialEntry = '/' }: { initialEntry?: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <CatalogProvider api={api}>
          <HeroSlider />
        </CatalogProvider>
      </ToastProvider>
      <Routes>
        <Route path="/" element={<span data-testid="page-home">خانه</span>} />
        <Route path="/category/:slug" element={<span data-testid="page-category">دسته</span>} />
      </Routes>
    </MemoryRouter>
  )
}

/**
 * Slides are built from the live category list, so the first render only shows
 * the loading state. Flushing the catalog promise keeps the fake timers under
 * the test's control (no `findBy*`, which would wait on real timers).
 */
async function renderSlider() {
  const result = render(<Harness />)
  await act(async () => {})
  return result
}

function expectSlides() {
  expect(screen.getByRole('button', { name: /مشاهده دسته/ })).toBeInTheDocument()
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('HeroSlider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds every slide from the delivered category list', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    expect(screen.getByRole('heading', { name: /ابزار برقی/ })).toBeInTheDocument()
    expect(screen.getByText('۳۲۰ کالا')).toBeInTheDocument()
    // The remaining delivered categories are reachable through the carousel.
    fireEvent.click(screen.getByRole('button', { name: 'اسلاید 2' }))
    expect(screen.getByRole('heading', { name: /ابزار دستی/ })).toBeInTheDocument()
    expect(screen.getByText('۴۸۰ کالا')).toBeInTheDocument()
    // No marketing copy about the category contents is hardcoded.
    expect(screen.queryByText('دریل، فرز و بتن‌کن')).not.toBeInTheDocument()
  })

  it('renders a labelled carousel region with accessible controls', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    expect(screen.getByRole('region', { name: 'اسلایدر دسته‌بندی‌های فروشگاه' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /اسلاید قبلی/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /اسلاید بعدی/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')
  })

  it('auto-advances on the interval', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    advance(5000)

    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('pauses auto-advance while the pointer is over the slider and resumes after', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    const controlsGroup = screen.getByRole('group', { name: 'انتخاب اسلاید' })
    fireEvent.mouseEnter(controlsGroup)

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')

    fireEvent.mouseLeave(controlsGroup)
    advance(5000)
    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('pauses auto-advance while an inner control is focused and resumes after', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    const next = screen.getByRole('button', { name: /اسلاید بعدی/ })
    fireEvent.focus(next)

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')

    fireEvent.blur(next)
    advance(5000)
    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('jumps to the selected slide from a dot control', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    fireEvent.click(screen.getByRole('button', { name: 'اسلاید 3' }))

    expect(screen.getByRole('button', { name: 'اسلاید 3' })).toHaveAttribute('aria-current', 'true')
  })

  it('keeps the pause/play control available on every breakpoint', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    const pause = screen.getByRole('button', { name: /توقف چرخش خودکار|ادامه چرخش خودکار/ })
    expect(pause).toBeInTheDocument()
    expect(pause.closest('[class~="hidden"]')).toBeNull()
    expect(pause).not.toBeDisabled()
  })

  it('does not flip the pause control semantics from hover or focus alone', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    const pause = screen.getByRole('button', { name: 'توقف چرخش خودکار' })
    expect(pause).toHaveAttribute('aria-pressed', 'false')

    fireEvent.mouseEnter(screen.getByRole('group', { name: 'انتخاب اسلاید' }))
    fireEvent.focus(pause)
    expect(screen.getByRole('button', { name: 'توقف چرخش خودکار' })).toBe(pause)
    expect(pause).toHaveAttribute('aria-pressed', 'false')

    fireEvent.mouseLeave(screen.getByRole('group', { name: 'انتخاب اسلاید' }))
    fireEvent.click(pause)
    const resume = screen.getByRole('button', { name: 'ادامه چرخش خودکار' })
    expect(resume).toHaveAttribute('aria-pressed', 'true')

    fireEvent.focus(resume)
    expect(screen.getByRole('button', { name: 'ادامه چرخش خودکار' })).toBe(resume)
    expect(resume).toHaveAttribute('aria-pressed', 'true')
  })

  it('stops auto-advance from a permanent pause/play control and resumes it', async () => {
    vi.useFakeTimers()
    await renderSlider()
    expectSlides()

    const toggle = screen.getByRole('button', { name: /توقف چرخش خودکار|ادامه چرخش خودکار/ })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: /ادامه چرخش خودکار/ })).toHaveAttribute('aria-pressed', 'true')
    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')

    fireEvent.click(screen.getByRole('button', { name: /ادامه چرخش خودکار/ }))
    expect(screen.getByRole('button', { name: /توقف چرخش خودکار/ })).toHaveAttribute('aria-pressed', 'false')
    advance(5000)
    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('honours prefers-reduced-motion by disabling autoplay and transitions', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    await renderSlider()
    vi.useFakeTimers()

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /ادامه چرخش خودکار/ })).toBeDisabled()
    vi.unstubAllGlobals()
  })

  it('navigates to the category linked by the active slide CTA', async () => {
    vi.useFakeTimers()
    const { getByTestId } = await renderSlider()

    fireEvent.click(screen.getByRole('button', { name: /مشاهده دسته/ }))

    expect(getByTestId('page-category')).toBeInTheDocument()
  })

  it('renders a single slide without auto-advancing when the catalog has one category', async () => {
    vi.useFakeTimers()
    vi.mocked(api.listCategories).mockResolvedValueOnce([CATEGORIES[0]])
    render(<Harness />)
    await act(async () => {})

    expect(screen.getByRole('heading', { name: /ابزار برقی/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'اسلاید 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'توقف چرخش خودکار' })).toBeInTheDocument()

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')
  })

  it('skips categories with no products instead of linking to an empty page', async () => {
    vi.useFakeTimers()
    vi.mocked(api.listCategories).mockResolvedValueOnce([
      { ...CATEGORIES[0], id: 'cat-empty', name: 'دسته خالی', slug: 'empty', productCount: 0 },
      CATEGORIES[1],
      CATEGORIES[2],
    ])
    render(<Harness />)
    await act(async () => {})

    expect(screen.queryByRole('heading', { name: 'دسته خالی' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('heading', { name: /ابزار دستی/ })).toBeInTheDocument()
  })

  it('states the empty catalog instead of rendering placeholder slides', async () => {
    vi.useFakeTimers()
    vi.mocked(api.listCategories).mockResolvedValueOnce([])
    render(<Harness />)
    await act(async () => {})

    expect(screen.getByText('هنوز دسته‌بندی فعالی در فروشگاه ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'اسلاید 1' })).not.toBeInTheDocument()
  })

  it('offers a retry instead of claiming the catalog is empty when the request fails', async () => {
    vi.mocked(api.listCategories).mockRejectedValueOnce(new Error('boom'))
    render(<Harness />)
    await act(async () => {})

    // A network failure is not an empty shop, and the hero is the first thing a
    // customer sees, so it has to be retryable rather than silently blank.
    const failure = screen.getByRole('alert')
    expect(failure).toHaveTextContent('بارگذاری دسته‌بندی‌ها با خطا مواجه شد.')
    expect(screen.queryByText('هنوز دسته‌بندی فعالی در فروشگاه ثبت نشده است.')).not.toBeInTheDocument()

    vi.mocked(api.listCategories).mockResolvedValueOnce(CATEGORIES)
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await act(async () => {})

    expect(api.listCategories).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toBeInTheDocument()
  })
})