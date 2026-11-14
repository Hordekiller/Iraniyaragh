import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomepageBannerPublic } from '@iranyaragh/contracts'
import { HeroSlider } from './HeroSlider'

function renderSlider(banners?: HomepageBannerPublic[]) { return render(<MemoryRouter><HeroSlider banners={banners} /></MemoryRouter>) }

describe('HeroSlider', () => {
  beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('uses cabinet hardware imagery and wraps RTL keyboard navigation', () => {
    const { container } = renderSlider()
    const slider = screen.getByRole('region', { name: 'پیشنهادهای فروشگاه' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/cabinet-hinge-hero.webp')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(screen.getByRole('link', { name: 'جستجوی دستگیره' })).toHaveAttribute('href', '/search?q=%D8%AF%D8%B3%D8%AA%DA%AF%DB%8C%D8%B1%D9%87')
    expect(screen.getByRole('button', { name: 'نمایش اسلاید 3' })).toHaveAttribute('aria-current', 'true')
  })

  it('rotates automatically, stops, and resumes from Play even while hovered and focused', () => {
    vi.useFakeTimers()
    renderSlider()
    const slider = screen.getByRole('region', { name: 'پیشنهادهای فروشگاه' })
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('heading', { name: 'ریل کشو و حرکت نرم' })).toBeInTheDocument()
    fireEvent.mouseEnter(slider)
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByRole('heading', { name: 'ریل کشو و حرکت نرم' })).toBeInTheDocument()
    const play = screen.getByRole('button', { name: 'شروع پخش خودکار' })
    fireEvent.focus(play)
    fireEvent.click(play)
    fireEvent.mouseEnter(slider)
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('heading', { name: 'دستگیره‌های کابینت' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'توقف پخش خودکار' }))
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.getByRole('heading', { name: 'دستگیره‌های کابینت' })).toBeInTheDocument()
  })

  it('renders admin-edited text, image and destination', () => {
    const { container } = renderSlider([{ id: 'edited', title: 'متن ویرایش‌شده', subtitle: 'زیرعنوان جدید', ctaLabel: 'برو', href: '/categories/hinges', imageAlt: 'لولا', desktopImage: { url: '/custom.webp', width: 1600, height: 900 }, mobileImage: null }])
    expect(screen.getByRole('heading', { name: 'متن ویرایش‌شده' })).toBeInTheDocument()
    expect(screen.getByText('زیرعنوان جدید')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'برو' })).toHaveAttribute('href', '/categories/hinges')
    expect(container.querySelector('img')).toHaveAttribute('src', '/custom.webp')
  })

  it('respects reduced motion and keeps discovery after an image fails', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const { container } = renderSlider()
    expect(screen.queryByRole('button', { name: 'شروع پخش خودکار' })).not.toBeInTheDocument()
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'اسلاید بعدی' }))
    expect(container.querySelector('img')).toHaveAttribute('src', '/images/cabinet-drawer-hero.webp')
  })
})
