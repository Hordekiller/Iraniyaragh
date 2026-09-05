import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../feedback/Toast'
import { Bestsellers } from './Bestsellers'
import { PopularTools } from './PopularTools'
import { SpecialCollection } from './SpecialCollection'
import { SearchResults } from './SearchResults'

function withToast(node: ReactNode) {
  return <ToastProvider>{node}</ToastProvider>
}

describe('storefront product cards › a11y baseline (#82)', () => {
  it('renders bestseller cards as native buttons with accessible names', () => {
    render(withToast(<Bestsellers onSelectProduct={vi.fn()} />))

    const cards = screen.getAllByRole('button', { name: /تومان/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    const pointing = screen.getByText(/پرفروش‌ترین‌ها/)
    expect(pointing.tagName).toBe('H2')
  })

  it('renders carousel scroll buttons with Persian accessible labels', () => {
    render(withToast(<Bestsellers onSelectProduct={vi.fn()} />))

    expect(screen.getByRole('button', { name: 'پیمایش به راست' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به چپ' })).toBeInTheDocument()
  })

  it('renders popular-tool cards as native buttons that open the product', () => {
    const onSelect = vi.fn()
    render(withToast(<PopularTools onSelectProduct={onSelect} />))

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
    render(withToast(<SpecialCollection onSelectProduct={onSelect} />))

    const cards = screen.getAllByRole('button', { name: /م تومن/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    expect(screen.getByRole('heading', { level: 2, name: 'سری مشکی رونیکس' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به راست' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به چپ' })).toBeInTheDocument()
  })

  it('renders search result cards as native buttons', () => {
    const onSelect = vi.fn()
    render(<SearchResults query="دریل" onSelectProduct={onSelect} />)

    const cards = screen.getAllByRole('button')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    fireEvent.click(cards[0])
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('keeps no product card implemented as a click-only generic element', () => {
    const { container } = render(withToast(<Bestsellers onSelectProduct={vi.fn()} />))

    const clickableDivs = container.querySelectorAll('div[onclick]')
    expect(clickableDivs.length).toBe(0)
  })
})