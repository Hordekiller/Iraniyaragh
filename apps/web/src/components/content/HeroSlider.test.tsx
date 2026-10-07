import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroSlider } from './HeroSlider'

function renderSlider() { return render(<MemoryRouter><HeroSlider /></MemoryRouter>) }

describe('HeroSlider', () => {
  beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('keeps one heading/CTA and wraps RTL keyboard navigation without hidden focus targets', () => {
    renderSlider()
    const slider = screen.getByRole('region', { name: 'پیشنهادهای فروشگاه' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(screen.getByRole('link', { name: 'پیگیری سفارش‌ها' })).toHaveAttribute('href', '/orders')
    expect(screen.getByRole('button', { name: 'نمایش اسلاید 3' })).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'اسلاید بعدی' }))
    expect(screen.getByRole('link', { name: 'مشاهده کالاها' })).toHaveAttribute('href', '/search')
  })

  it('pauses opted-in rotation while hovered or focused', () => {
    vi.useFakeTimers()
    renderSlider()
    const slider = screen.getByRole('region', { name: 'پیشنهادهای فروشگاه' })
    fireEvent.click(screen.getByRole('button', { name: 'شروع پخش خودکار' }))
    fireEvent.mouseEnter(slider)
    vi.advanceTimersByTime(11000)
    expect(screen.getByRole('link', { name: 'مشاهده کالاها' })).toBeInTheDocument()
    fireEvent.mouseLeave(slider)
    fireEvent.focus(screen.getByRole('button', { name: 'اسلاید بعدی' }))
    vi.advanceTimersByTime(11000)
    expect(screen.getByRole('link', { name: 'مشاهده کالاها' })).toBeInTheDocument()
  })

  it('respects reduced motion and keeps discovery available after an image fails', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const { container } = renderSlider()
    expect(screen.queryByRole('button', { name: 'شروع پخش خودکار' })).not.toBeInTheDocument()
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'مشاهده کالاها' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'اسلاید بعدی' }))
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/hero2.jpg')
  })
})
