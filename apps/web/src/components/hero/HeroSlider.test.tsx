import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../feedback/Toast'
import { HeroSlider } from './HeroSlider'

function Harness() {
  return (
    <ToastProvider>
      <HeroSlider />
    </ToastProvider>
  )
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

  it('renders a labelled carousel region with accessible controls', () => {
    vi.useFakeTimers()
    render(<Harness />)

    expect(screen.getByRole('region', { name: 'اسلایدر پیشنهاد ویژه' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /اسلاید قبلی/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /اسلاید بعدی/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')
  })

  it('auto-advances on the interval', () => {
    vi.useFakeTimers()
    render(<Harness />)

    advance(5000)

    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('pauses auto-advance while the pointer is over the slider and resumes after', () => {
    vi.useFakeTimers()
    render(<Harness />)

    const controlsGroup = screen.getByRole('group', { name: 'انتخاب اسلاید' })
    fireEvent.mouseEnter(controlsGroup)

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')

    fireEvent.mouseLeave(controlsGroup)
    advance(5000)
    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('pauses auto-advance while an inner control is focused and resumes after', () => {
    vi.useFakeTimers()
    render(<Harness />)

    const next = screen.getByRole('button', { name: /اسلاید بعدی/ })
    fireEvent.focus(next)

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')

    fireEvent.blur(next)
    advance(5000)
    expect(screen.getByRole('button', { name: 'اسلاید 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('jumps to the selected slide from a dot control', () => {
    vi.useFakeTimers()
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'اسلاید 3' }))

    expect(screen.getByRole('button', { name: 'اسلاید 3' })).toHaveAttribute('aria-current', 'true')
  })

  it('keeps the pause/play control available on every breakpoint', () => {
    vi.useFakeTimers()
    render(<Harness />)

    const pause = screen.getByRole('button', { name: /توقف چرخش خودکار|ادامه چرخش خودکار/ })
    expect(pause).toBeInTheDocument()
    expect(pause.closest('[class~="hidden"]')).toBeNull()
    expect(pause).not.toBeDisabled()
  })

  it('does not flip the pause control semantics from hover or focus alone', () => {
    vi.useFakeTimers()
    render(<Harness />)

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

  it('stops auto-advance from a permanent pause/play control and resumes it', () => {
    vi.useFakeTimers()
    render(<Harness />)

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

  it('honours prefers-reduced-motion by disabling autoplay and transitions', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<Harness />)

    advance(15000)
    expect(screen.getByRole('button', { name: 'اسلاید 1' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /ادامه چرخش خودکار/ })).toBeDisabled()
    vi.unstubAllGlobals()
  })
})