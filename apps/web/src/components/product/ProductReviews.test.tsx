import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicReviewList, ReviewEligibility } from '@iranyaragh/contracts'
import { ProductReviews } from './ProductReviews'

const mocks = vi.hoisted(() => ({ request: vi.fn(), open: vi.fn(), state: { phase: 'authenticated', principal: { userId: 'u1' } } as { phase: string; principal: { userId: string } } }))
vi.mock('../../state/auth-context', () => ({ useAuth: () => ({ state: mocks.state, restored: true, open: mocks.open, identityVersion: 1, request: Object.assign(mocks.request, { forCurrentPrincipal: () => mocks.request }) }) }))

const list: PublicReviewList = {
  summary: { count: 3, average: 4.7, counts: [0, 0, 0, 1, 2] },
  items: [{ id: 'r1', rating: 5, title: 'عالی', body: 'کیفیت و نصب بسیار خوب بود.', authorName: 'احمد ر.', verifiedPurchase: true, publishedAt: '2026-11-01T10:00:00.000Z', staffReply: 'ممنون از شما', staffRepliedAt: '2026-11-02T10:00:00.000Z' }],
  meta: { page: 1, pages: 1, total: 3, perPage: 10 },
}
const eligible: ReviewEligibility = { canReview: true, reason: 'ELIGIBLE', review: null }
afterEach(() => { vi.resetAllMocks(); mocks.state.phase = 'authenticated' })

describe('ProductReviews', () => {
  it('shows summary, verified-buyer label and the store reply, never a mobile number', () => {
    mocks.request.mockResolvedValue({ data: { canReview: false, reason: 'NOT_PURCHASED', review: null } })
    render(<ProductReviews slug="p" initial={list} />)
    expect(screen.getByText('از ۳ نظر')).toBeInTheDocument()
    expect(screen.getByText('خریدار این کالا')).toBeInTheDocument()
    expect(screen.getByText('ممنون از شما')).toBeInTheDocument()
    expect(screen.getByText(/احمد ر\./)).toBeInTheDocument()
  })
  it('asks anonymous visitors to sign in without calling a private endpoint', () => {
    mocks.state.phase = 'anonymous'
    render(<ProductReviews slug="p" initial={list} />)
    fireEvent.click(screen.getByRole('button', { name: 'ورود و ثبت نظر' }))
    expect(mocks.open).toHaveBeenCalledOnce()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('explains that only buyers can review when the server says not eligible', async () => {
    mocks.request.mockResolvedValue({ data: { canReview: false, reason: 'NOT_PURCHASED', review: null } })
    render(<ProductReviews slug="p" initial={list} />)
    expect(await screen.findByText(/برای خریدارانی است که/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ثبت نظر شما' })).not.toBeInTheDocument()
  })
  it('validates, then submits with an idempotency key and reports the pending moderation state', async () => {
    mocks.request.mockImplementation((path: string, options?: { method?: string }) => Promise.resolve({ data: options?.method === 'POST'
      ? { review: { id: 'n1', rating: 4, title: null, body: 'درب محکم و باکیفیت است', status: 'PENDING', version: 1, moderationNote: null, createdAt: '', updatedAt: '' } } : eligible }))
    render(<ProductReviews slug="p" initial={list} />)
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت نظر شما' }))
    fireEvent.click(screen.getByRole('button', { name: 'ارسال نظر' }))
    expect(screen.getByRole('alert')).toHaveTextContent('امتیاز')
    fireEvent.click(screen.getByRole('radio', { name: '۴ ستاره' }))
    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: 'درب محکم و باکیفیت است' } })
    fireEvent.click(screen.getByRole('button', { name: 'ارسال نظر' }))
    await waitFor(() => expect(screen.getByTestId('own-review')).toHaveTextContent('پس از بررسی'))
    const post = mocks.request.mock.calls.find(call => call[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/v1/reviews/products/p')
    expect(post[1].json).toEqual({ rating: 4, title: null, body: 'درب محکم و باکیفیت است' })
    expect(post[1].headers['Idempotency-Key']).toMatch(/^review-/)
  })
  it('does not claim success when the server refuses', async () => {
    mocks.request.mockImplementation((_path: string, options?: { method?: string }) => options?.method === 'POST' ? Promise.reject(new Error('network')) : Promise.resolve({ data: eligible }))
    render(<ProductReviews slug="p" initial={list} />)
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت نظر شما' }))
    fireEvent.click(screen.getByRole('radio', { name: '۵ ستاره' }))
    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: 'خیلی خوب و محکم بود' } })
    fireEvent.click(screen.getByRole('button', { name: 'ارسال نظر' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('تأیید نشد')
    expect(screen.queryByTestId('own-review')).not.toBeInTheDocument()
  })
})
