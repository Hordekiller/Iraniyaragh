import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderTracking } from './OrderTracking'
import { buildTracking } from './tracking'
import type { OrderDetail, OrderTimelineEntry } from '@iranyaragh/contracts'

const TOTALS = {
  subtotal: { amount: '1000000', currency: 'IRR' as const },
  discount: { amount: '0', currency: 'IRR' as const },
  shipping: { amount: '0', currency: 'IRR' as const },
  total: { amount: '1000000', currency: 'IRR' as const },
}

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    number: 'IR-0001-123',
    status: 'PAID',
    payment: { latestStatus: 'PAID', attemptCount: 1 },
    fulfillmentStatus: 'PENDING',
    itemCount: 1,
    totals: TOTALS,
    reservationExpiresAt: '2026-09-14T11:30:00.000Z',
    createdAt: '2026-09-14T10:30:00.000Z',
    updatedAt: '2026-09-14T10:35:00.000Z',
    address: null,
    shippingMethod: { code: 'POST', title: 'پست پیشتاز' },
    pricePolicyRevision: 'r1',
    shippingPolicyRevision: 'r1',
    items: [],
    payments: [
      { id: 'pay-1', status: 'PAID', amount: TOTALS.total, createdAt: '2026-09-14T10:31:00.000Z', updatedAt: '2026-09-14T10:31:30.000Z' },
    ],
    fulfillment: { status: 'PENDING', createdAt: '2026-09-14T10:31:00.000Z', updatedAt: '2026-09-14T10:31:00.000Z' },
    timeline: [],
    truncation: { items: false, payments: false, timeline: false },
    ...overrides,
  }
}

function timelineEntry(overrides: Partial<OrderTimelineEntry> = {}): OrderTimelineEntry {
  return {
    domain: 'ORDER',
    from: 'DRAFT',
    to: 'PENDING_PAYMENT',
    createdAt: '2026-09-14T10:30:00.000Z',
    ...overrides,
  }
}

describe('buildTracking', () => {
  it('marks only the states the server actually reported as done', () => {
    const { steps } = buildTracking(detail())

    const byId = Object.fromEntries(steps.map(step => [step.id, step.state]))
    expect(byId.placed).toBe('done')
    expect(byId.payment).toBe('done')
    // Fulfillment is still PENDING, so nothing downstream may look reached.
    expect(byId.PROCESSING).toBe('todo')
    expect(byId.READY_TO_SHIP).toBe('todo')
    expect(byId.SHIPPED).toBe('todo')
    expect(byId.DELIVERED).toBe('todo')
  })

  it('walks the fulfillment flow forward as the server advances it', () => {
    const { steps } = buildTracking(
      detail({ fulfillment: { status: 'SHIPPED', createdAt: '2026-09-14T10:31:00.000Z', updatedAt: '2026-09-14T12:00:00.000Z' }, fulfillmentStatus: 'SHIPPED' }),
    )
    const byId = Object.fromEntries(steps.map(step => [step.id, step.state]))
    expect(byId.PROCESSING).toBe('done')
    expect(byId.READY_TO_SHIP).toBe('done')
    expect(byId.SHIPPED).toBe('done')
    expect(byId.DELIVERED).toBe('todo')
  })

  it('makes an unpaid order the current step and links no payment as done', () => {
    const { steps, summary } = buildTracking(
      detail({ status: 'PENDING_PAYMENT', payments: [], payment: { latestStatus: null, attemptCount: 0 } }),
    )
    const payment = steps.find(step => step.id === 'payment')!
    expect(payment.state).toBe('current')
    expect(payment.hint).toBe('هنوز پرداختی ثبت نشده است.')
    expect(summary).toContain('پرداخت')
  })

  it('reports the pending fulfillment state instead of falling back to "placed"', () => {
    const { steps, summary } = buildTracking(detail())
    const byId = Object.fromEntries(steps.map(step => [step.id, step.state]))
    // The server said PENDING: that state must be present and standing.
    expect(byId.PENDING).toBe('done')
    expect(steps.find(step => step.id === 'PENDING')!.current).toBe(true)
    expect(summary).toContain('در انتظار آمادهسازی')
    expect(summary).not.toBe('وضعیت فعلی سفارش: ثبت سفارش')
  })

  it('blocks the payment step instead of leaving it pending once the order is cancelled', () => {
    const { steps } = buildTracking(
      detail({ status: 'CANCELLED', payments: [], payment: { latestStatus: null, attemptCount: 0 } }),
    )
    expect(steps.find(step => step.id === 'payment')!.state).toBe('blocked')
  })

  it('surfaces a stopped shipment as the real final state', () => {
    const { steps, summary } = buildTracking(
      detail({
        status: 'RETURNED',
        fulfillment: { status: 'RETURNED', createdAt: '2026-09-14T10:31:00.000Z', updatedAt: '2026-09-15T09:00:00.000Z' },
        fulfillmentStatus: 'RETURNED',
      }),
    )
    expect(steps.some(step => step.id === 'fulfillment-stopped' && step.state === 'current')).toBe(true)
    expect(summary).toContain('مرجوع')
  })

  it('never invents a carrier, tracking code or delivery date', () => {
    const { steps } = buildTracking(
      detail({ fulfillment: { status: 'SHIPPED', createdAt: '2026-09-14T10:31:00.000Z', updatedAt: '2026-09-14T12:00:00.000Z' } }),
    )
    const labels = steps.map(step => step.label).join(' ')
    expect(labels).not.toMatch(/تیپاکس|پست\s*\d|کد رهگیری|رهگیری\s*\d/)
    // DELIVERED is not reached, so it must carry no timestamp.
    expect(steps.find(step => step.id === 'DELIVERED')!.at).toBeUndefined()
  })

  it('survives an unknown server status without rendering undefined', () => {
    const { steps } = buildTracking(
      detail({ fulfillment: { status: 'SOMETHING_NEW' as never, createdAt: '2026-09-14T10:31:00.000Z', updatedAt: '2026-09-14T10:31:00.000Z' } }),
    )
    expect(steps.every(step => typeof step.label === 'string' && step.label.length > 0)).toBe(true)
  })
})

describe('OrderTracking', () => {
  it('renders the server timeline newest-first without dropping entries', () => {
    render(
      <OrderTracking
        order={detail({
          timeline: [
            timelineEntry({ to: 'PAID', createdAt: '2026-09-14T10:30:00.000Z' }),
            timelineEntry({ domain: 'PAYMENT', from: 'PENDING', to: 'PAID', createdAt: '2026-09-14T10:31:00.000Z' }),
            timelineEntry({ domain: 'FULFILLMENT', from: 'PENDING', to: 'PROCESSING', createdAt: '2026-09-14T10:40:00.000Z' }),
          ],
        })}
      />,
    )

    expect(screen.getByText('تاریخچهٔ تغییرات (۳)')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').filter(item => item.textContent?.includes('·'))
    expect(items).toHaveLength(3)
    // Newest first.
    expect(items[0]).toHaveTextContent('ارسال: در حال آمادهسازی')
  })

  it('says plainly when no timeline was reported instead of showing an empty list', () => {
    render(<OrderTracking order={detail({ timeline: [] })} />)

    expect(screen.getByText('تاریخچهٔ تغییرات برای این سفارش ثبت نشده است.')).toBeInTheDocument()
  })

  it('warns when the server truncated the timeline', () => {
    render(<OrderTracking order={detail({ truncation: { items: false, payments: false, timeline: true } })} />)

    // The panel also has an sr-only live status, so match on the text itself.
    expect(
      screen.getAllByRole('status').some(node => node.textContent?.includes('فقط بخشی از آن نمایش داده می‌شود')),
    ).toBe(true)
  })

  it('exposes the current status to assistive tech', () => {
    render(<OrderTracking order={detail()} />)

    const region = screen.getByRole('region', { name: 'پیگیری سفارش' })
    expect(within(region).getAllByRole('status').some(node => /وضعیت فعلی سفارش/.test(node.textContent ?? ''))).toBe(true)
  })
})
