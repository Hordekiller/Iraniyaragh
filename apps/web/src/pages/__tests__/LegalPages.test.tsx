import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from '../PrivacyPage'
import { TermsPage } from '../TermsPage'

describe('restored legal pages', () => {
  it('describes server-held guest carts and actual customer self-service without invented contacts', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'حریم خصوصی' })).toBeInTheDocument()
    expect(screen.getByText(/سبد مهمان در سامانهٔ فروشگاه نگهداری/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'حساب کاربری' })).toHaveAttribute('href', '/account')
    expect(screen.getByText(/بستن دائمی حساب در حال حاضر فراهم نیست/)).toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
    expect(screen.getByText(/اطلاعات تماس تأییدشدهٔ فروشگاه هنوز منتشر نشده/)).toBeInTheDocument()
  })
  it('keeps unapproved return policies explicit and never promises payment-provider availability', () => {
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(screen.getByText(/در صورت فعال بودن درگاه/)).toBeInTheDocument()
    expect(screen.getByText(/ثبت سفارش به معنی پرداخت نیست/)).toBeInTheDocument()
    expect(screen.getAllByText(/در انتظار اعلام فروشنده/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'حریم خصوصی' })).toHaveAttribute('href', '/privacy')
  })
})
