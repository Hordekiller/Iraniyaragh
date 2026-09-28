import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NewsletterStatus } from './NewsletterStatus'

describe('NewsletterStatus', () => {
  it('states that subscriptions are unavailable without collecting contact details or promising a discount', () => {
    localStorage.clear()
    localStorage.setItem('iranyaragh.newsletter.subscriptions.v1', '[{"contact":"test@example.com"}]')
    render(<NewsletterStatus />)

    expect(screen.getByRole('region', { name: 'خبرنامه هنوز فعال نیست' })).toBeInTheDocument()
    expect(screen.getByText(/ثبت‌نام و ارسال کد تخفیف در حال حاضر انجام نمی‌شود/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /دریافت کد|عضویت/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/برای شما ارسال شد/)).not.toBeInTheDocument()
    expect(localStorage.getItem('iranyaragh.newsletter.subscriptions.v1')).toBeNull()
    expect(localStorage.length).toBe(0)
  })
})
