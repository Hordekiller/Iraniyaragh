import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from './MobileBottomNav'
import { ToastProvider } from '../feedback/Toast'
import { ROUTES } from '../../lib/routes'
import { AuthProvider } from '../../state/AuthProvider'

function Harness({ onOpenSearch = vi.fn(), onOpenLogin = vi.fn() }: { onOpenSearch?: () => void; onOpenLogin?: () => void }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <MobileBottomNav onOpenSearch={onOpenSearch} onOpenLogin={onOpenLogin} />
        <RouteProbe />
      </AuthProvider>
    </ToastProvider>
  )
}

function RouteProbe() {
  const { pathname } = useLocation()
  return <span data-testid="current-path">{pathname}</span>
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  it('is exposed as a labelled navigation landmark', () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation', { name: 'ناوبری پایین' })).toBeInTheDocument()
  })

  it('triggers the search opener', () => {
    const onOpenSearch = vi.fn()
    render(
      <MemoryRouter>
        <Harness onOpenSearch={onOpenSearch} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /جستجو/ }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('opens login from the profile button for a guest', () => {
    const onOpenLogin = vi.fn()
    render(
      <MemoryRouter initialEntries={[ROUTES.home]}>
        <Harness onOpenLogin={onOpenLogin} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /حساب کاربری/ }))

    expect(onOpenLogin).toHaveBeenCalledTimes(1)
  })

  it('navigates home from the home button', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Harness />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /خانه/ }))

    expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTES.home)
  })

  it('routes the categories button to home when not on the home page', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Harness />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /دسته‌بندی‌ها/ }))

    expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTES.home)
  })
})
