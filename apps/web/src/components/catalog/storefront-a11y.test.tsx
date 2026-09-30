import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PopularTools } from './PopularTools'
import { CatalogProvider } from '../../state/CatalogProvider'
import { CatalogFixtureClient } from '../../services/catalog/fixtures'

function withCatalog(node: ReactNode) {
  return (
    <MemoryRouter>
      <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
        {node}
      </CatalogProvider>
    </MemoryRouter>
  )
}

describe('storefront product cards › a11y baseline (#82)', () => {
  it('renders newest product cards as native buttons with accessible names', async () => {
    render(withCatalog(<PopularTools onSelectProduct={vi.fn()} />))

    const cards = await screen.findAllByRole('button', { name: /تومان/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    const pointing = screen.getByText(/تازه‌های فروشگاه/)
    expect(pointing.tagName).toBe('H2')
  })

  it('renders carousel scroll buttons with Persian accessible labels', async () => {
    render(withCatalog(<PopularTools onSelectProduct={vi.fn()} />))

    expect(await screen.findByRole('button', { name: 'پیمایش به راست' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پیمایش به چپ' })).toBeInTheDocument()
  })

  it('renders popular-tool cards as native buttons that open the product', async () => {
    const onSelect = vi.fn()
    render(withCatalog(<PopularTools onSelectProduct={onSelect} />))

    const cards = await screen.findAllByRole('button', { name: /تومان/ })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveAttribute('type', 'button')

    fireEvent.click(cards[0])
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('keeps no product card implemented as a click-only generic element', async () => {
    const { container } = render(withCatalog(<PopularTools onSelectProduct={vi.fn()} />))

    await screen.findAllByRole('button', { name: /تومان/ })

    const clickableDivs = container.querySelectorAll('div[onclick]')
    expect(clickableDivs.length).toBe(0)
  })
})

describe('storefront CTAs › real destinations instead of toasts', () => {
  it('reveals ordering details inline instead of showing a toast', async () => {
    render(withCatalog(<PopularTools onSelectProduct={vi.fn()} />))

    await screen.findAllByRole('button', { name: /تومان/ })

    const detailsButton = screen.getByRole('button', { name: 'جزئیات' })
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(detailsButton)

    expect(detailsButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/هزینهٔ ارسال پس از واردکردن اطلاعات دریافت‌کننده اعلام می‌شود/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.queryByText(/هزینهٔ ارسال پس از واردکردن اطلاعات دریافت‌کننده اعلام می‌شود/)).not.toBeInTheDocument()
  })
})