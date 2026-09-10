import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from './MobileBottomNav'
import { ToastProvider } from '../feedback/Toast'
import { ROUTES } from '../../lib/routes'

function Harness({ onOpenSearch = vi.fn() }: { onOpenSearch?: () => void }) {
  return (
    <ToastProvider>
      <MobileBottomNav onOpenSearch={onOpenSearch} />
      <RouteProbe />
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

  it('navigates to the account page from the profile button', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.home]}>
        <Harness />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /حساب کاربری/ }))

    expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTES.account)
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