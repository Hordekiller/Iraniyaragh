import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ServicesPage } from './ServicesPage'
import { ROUTES } from '../lib/routes'

function renderPage() {
  return render(
    <MemoryRouter>
      <ServicesPage />
    </MemoryRouter>,
  )
}

describe('ServicesPage', () => {
  it('is a real page for the services navigation entry', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'خدمات فروشگاه', level: 1 })).toBeInTheDocument()
  })

  it('links every service card to the page that performs it', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute('href', ROUTES.orders)
    expect(screen.getByRole('link', { name: /ورود به حساب/ })).toHaveAttribute('href', ROUTES.account)
    expect(screen.getByRole('link', { name: /مشاهده کاتالوگ/ })).toHaveAttribute('href', ROUTES.products)
    expect(screen.getByRole('link', { name: /مشاهده سبد خرید/ })).toHaveAttribute('href', ROUTES.cart)
  })

  it('offers routes onward from the page so it is not a dead end', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'مشاهده همه کالاها' })).toHaveAttribute('href', ROUTES.products)
    expect(screen.getByRole('link', { name: 'مرور دسته‌بندی‌ها' })).toHaveAttribute('href', ROUTES.categories)
  })

  it('states only capabilities the storefront actually has', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'پرسش‌های متداول' })).toBeInTheDocument()
    // No fabricated support-hours or guarantee claims.
    expect(screen.queryByText(/پشتیبانی ۲۴ ساعته/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ضمانت بازگشت/)).not.toBeInTheDocument()
  })
})
