import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../feedback/Toast'
import { AuthProvider } from '../../state/AuthProvider'
import { CartProvider } from '../../state/CartProvider'
import { commerceStub, signedInStore, testAuthProps } from '../../test/commerce'
import { AppLayout } from './AppLayout'
import { MemorySessionStore } from '../../lib/auth/session-store'
import { CartPage } from '../../pages/CartPage'

describe('AppLayout', () => {
  it('renders the shared RTL shell and live cart count', async () => {
    const store = signedInStore()
    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider {...testAuthProps(store)}>
            <CartProvider api={commerceStub()}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<span>outlet-content</span>} />
                </Route>
              </Routes>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('outlet-content')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'سبد خرید، ۲ کالا' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'ناوبری پایین' }),
    ).toBeInTheDocument()
  })

  it('opens the shared login dialog from an anonymous commerce route', async () => {
    const store = new MemorySessionStore()
    render(
      <MemoryRouter initialEntries={['/cart']}>
        <ToastProvider>
          <AuthProvider {...testAuthProps(store)}>
            <CartProvider api={commerceStub()}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/cart" element={<CartPage />} />
                </Route>
              </Routes>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    )

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'ورود با موبایل و ادامه خرید',
      }),
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('شماره موبایل')).toBeInTheDocument()
  })
})
