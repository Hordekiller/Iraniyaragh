import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToastProvider } from '../feedback/Toast'
import { NewsletterBrands } from './NewsletterBrands'

function renderNewsletter() {
  return render(
    <ToastProvider>
      <NewsletterBrands />
    </ToastProvider>,
  )
}

describe('NewsletterBrands', () => {
  it('shows the club title and a brand list', () => {
    renderNewsletter()

    expect(screen.getByRole('heading', { name: 'عضو باشگاه استادکاران شوید' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'برندهای موجود' })).toBeInTheDocument()
  })

  it('rejects an invalid contact with a Persian error message', () => {
    renderNewsletter()

    fireEvent.change(screen.getByLabelText('شماره موبایل یا ایمیل'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }))

    expect(screen.getByRole('alert')).toHaveTextContent('شماره موبایل (۱۱ رقمی، شروع با ۰۹) یا ایمیل معتبر وارد کنید.')
  })

  it('clears the inline error as soon as the user edits the field', () => {
    renderNewsletter()

    fireEvent.change(screen.getByLabelText('شماره موبایل یا ایمیل'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('شماره موبایل یا ایمیل'), { target: { value: '09123456789' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('subscribes a valid email and shows the discount toast', async () => {
    renderNewsletter()

    fireEvent.change(screen.getByLabelText('شماره موبایل یا ایمیل'), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'دریافت کد' }))

    expect(await screen.findByRole('status')).toHaveTextContent('کد تخفیف')
    expect(screen.getByLabelText('شماره موبایل یا ایمیل')).toHaveValue('')
  })
})