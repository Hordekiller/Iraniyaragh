import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../feedback/Toast'
import { Bestsellers } from './Bestsellers'
import { PopularTools } from './PopularTools'
import { SpecialCollection } from './SpecialCollection'
import { ROUTES } from '../../lib/routes'

function withRouter(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>
  )
}

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname}{search}</span>
}

function withRouterProbe(node: ReactNode) {
  return (
    <MemoryRouter initialEntries={[ROUTES.home]}>
      <ToastProvider>{node}</ToastProvider>
      <LocationProbe />
    </MemoryRouter>
  )
}

describe('storefront product cards › a11y baseline (#82)', () => {
  it('renders bestseller cards as native buttons with accessible names', () => {
    render(withRouter(<Bestsellers onSelectProduct={vi.fn()} />))

    const cards = screen.getAllByRole('button', { name: /تومان/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    const pointing = screen.getByText(/پرفروش‌ترین‌ها/)
    expect(pointing.tagName).toBe('H2')
  })

  it('renders carousel scroll buttons with Persian accessible labels', () => {
    render(withRouter(<Bestsellers onSelectProduct={vi.fn()} />))

    expect(screen.getByRole('button', { name: 'پیمایش به راست' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به چپ' })).toBeInTheDocument()
  })

  it('renders popular-tool cards as native buttons that open the product', () => {
    const onSelect = vi.fn()
    render(withRouter(<PopularTools onSelectProduct={onSelect} />))

    const cards = screen.getAllByRole('button', { name: /تومان/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    fireEvent.click(cards[0])
    expect(onSelect).toHaveBeenCalledOnce()

    expect(screen.getByRole('button', { name: 'پیمایش به راست' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به چپ' })).toBeInTheDocument()
  })

  it('renders special-collection cards as native buttons and gives the banner a heading', () => {
    const onSelect = vi.fn()
    render(withRouter(<SpecialCollection onSelectProduct={onSelect} />))

    const cards = screen.getAllByRole('button', { name: /م تومن/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    expect(screen.getByRole('heading', { level: 2, name: 'سری مشکی رونیکس' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به راست' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به چپ' })).toBeInTheDocument()
  })

  it('keeps no product card implemented as a click-only generic element', () => {
    const { container } = render(withRouter(<Bestsellers onSelectProduct={vi.fn()} />))

    const clickableDivs = container.querySelectorAll('div[onclick]')
    expect(clickableDivs.length).toBe(0)
  })
})

describe('storefront CTAs › real destinations instead of toasts', () => {
  it('routes the bestsellers "view all" CTA to the bestsellers page', () => {
    render(withRouterProbe(<Bestsellers onSelectProduct={vi.fn()} />))

    fireEvent.click(screen.getByRole('button', { name: /مشاهده همه پرفروش‌ها/ }))

    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.bestsellers)
  })

  it('routes the special-collection CTA to a Ronix-brand search', () => {
    render(withRouterProbe(<SpecialCollection onSelectProduct={vi.fn()} />))

    fireEvent.click(screen.getByRole('button', { name: 'نمایش کلکسیون' }))

    expect(screen.getByTestId('location')).toHaveTextContent(`${ROUTES.search}?q=Ronix`)
  })

  it('reveals shipping details inline instead of showing a toast', () => {
    render(withRouter(<PopularTools onSelectProduct={vi.fn()} />))

    const detailsButton = screen.getByRole('button', { name: 'جزئیات' })
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(detailsButton)

    expect(detailsButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/ارسال رایگان برای سفارش‌های بالای/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.queryByText(/ارسال رایگان برای سفارش‌های بالای/)).not.toBeInTheDocument()
  })
})