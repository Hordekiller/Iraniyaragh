import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from './MobileBottomNav'
import { ToastProvider } from '../feedback/Toast'

function Harness({ onOpenSearch = vi.fn() }: { onOpenSearch?: () => void }) {
  return (
    <ToastProvider>
      <section id="home" />
      <section id="categories" />
      <MobileBottomNav onOpenSearch={onOpenSearch} />
    </ToastProvider>
  )
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    window.scrollTo = vi.fn()
  })

  it('is exposed as a labelled navigation landmark', () => {
    render(<Harness />)
    expect(screen.getByRole('navigation', { name: 'ناوبری پایین' })).toBeInTheDocument()
  })

  it('marks the active item with aria-current', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /خانه/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /جستجو/ })).not.toHaveAttribute('aria-current')

    fireEvent.click(screen.getByRole('button', { name: /جستجو/ }))

    expect(screen.getByRole('button', { name: /جستجو/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /خانه/ })).not.toHaveAttribute('aria-current')
  })

  it('triggers the search opener', () => {
    const onOpenSearch = vi.fn()
    render(<Harness onOpenSearch={onOpenSearch} />)

    fireEvent.click(screen.getByRole('button', { name: /جستجو/ }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })
})