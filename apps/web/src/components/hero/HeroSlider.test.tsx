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
})