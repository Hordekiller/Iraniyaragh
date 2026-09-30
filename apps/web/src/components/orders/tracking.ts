import type { FulfillmentStatus, OrderDetail, OrderTimelineEntry } from '@iranyaragh/contracts'
import { FULFILLMENT_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../../services/commerce/types'

/**
 * Pure derivation of the tracking stepper from a delivered `OrderDetail`.
 *
 * Kept apart from the component so it can be unit-tested directly and so the
 * view file stays a component-only module (fast-refresh).
 *
 * Rules that must not drift:
 * - A step is `done` only when the server reported that state.
 * - The *current* step is the first not-yet-reached state, so an order sitting
 *   at `PENDING` reports "pending", not "placed".
 * - Nothing is inferred beyond the contract: no carrier, tracking code or
 *   delivery date, because the order contract carries none.
 */

export type StepState = 'done' | 'current' | 'todo' | 'blocked'

export type Step = {
  id: string
  label: string
  state: StepState
  /** The single step the order is standing on right now. */
  current?: boolean
  at?: string
  hint?: string
}

export type TrackingModel = {
  summary: string
  steps: Step[]
}

/** The full fulfillment path, starting from the first not-yet-reached state. */
const FULFILLMENT_FLOW = [
  'PENDING',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
] as const satisfies readonly FulfillmentStatus[]

const PAYMENT_SETTLED: readonly string[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']

function indexIn<T extends string>(value: T | null | undefined, flow: readonly T[]): number {
  if (!value) return -1
  return flow.indexOf(value)
}

/** Narrow label lookups keep an unexpected server value visible. */
export function orderStateLabel(value: string): string {
  const map: Record<string, string> = {
    DRAFT: 'پیشنویس',
    PENDING_PAYMENT: 'در انتظار پرداخت',
    PAID: 'پرداخت‌شده',
    CANCELLED: 'لغوشده',
    RETURNED: 'مرجوع‌شده',
  }
  return map[value] ?? value
}

export function paymentStateLabel(value: string): string {
  return PAYMENT_SETTLED.includes(value) || value in (PAYMENT_STATUS_LABEL as object)
    ? (PAYMENT_STATUS_LABEL as Record<string, string>)[value]
    : value
}

export function timelineLabel(entry: OrderTimelineEntry): string {
  const to = entry.to as OrderTimelineEntry['to']
  if (entry.domain === 'ORDER') return `وضعیت سفارش: ${orderStateLabel(to)}`
  if (entry.domain === 'PAYMENT') return `پرداخت: ${paymentStateLabel(to)}`
  return `ارسال: ${FULFILLMENT_STATUS_LABEL[to as FulfillmentStatus] ?? String(to)}`
}

export function buildTracking(order: OrderDetail): TrackingModel {
  const closed = order.status === 'CANCELLED' || order.status === 'RETURNED'
  const payment = order.payments[0]?.status ?? null
  const paid = payment !== null && PAYMENT_SETTLED.includes(payment)
  const fulfillment = order.fulfillment?.status ?? null
  const reached = indexIn(fulfillment, FULFILLMENT_FLOW)
  const shipmentStopped = fulfillment === 'CANCELLED' || fulfillment === 'RETURNED'

  const steps: Step[] = [
    { id: 'placed', label: 'ثبت سفارش', state: 'done', at: order.createdAt },
    {
      id: 'payment',
      label: paid ? 'پرداخت تأیید شد' : 'پرداخت',
      state: paid ? 'done' : closed ? 'blocked' : 'current',
      current: !paid && !closed,
      // A settled payment carries no `paidAt` in the contract; its own
      // `updatedAt` is the truthful moment the server last wrote that state.
      at: paid ? order.payments[0]?.updatedAt : undefined,
      hint: paid
        ? undefined
        : closed
          ? 'این سفارش پرداخت نشده است.'
          : payment
            ? `آخرین وضعیت پرداخت: ${PAYMENT_STATUS_LABEL[payment]}`
            : 'هنوز پرداختی ثبت نشده است.',
    },
  ]

  // Fulfillment walks the whole delivered flow, so a `PENDING` order shows its
  // own state instead of skipping straight to "processing". `state` stays a
  // reached/not-reached fact; `current` marks the one step being stood on.
  for (let position = 0; position < FULFILLMENT_FLOW.length; position += 1) {
    const state = FULFILLMENT_FLOW[position]!
    const isDone = reached >= position
    const isTerminal = position === FULFILLMENT_FLOW.length - 1
    steps.push({
      id: state,
      label: FULFILLMENT_STATUS_LABEL[state],
      state: (isDone ? 'done' : 'todo') as StepState,
      current: paid && !closed && reached === position && !isTerminal,
      at: isDone && isTerminal ? order.fulfillment?.updatedAt : undefined,
    })
  }

  if (shipmentStopped && fulfillment) {
    steps.push({
      id: 'fulfillment-stopped',
      label: FULFILLMENT_STATUS_LABEL[fulfillment],
      state: 'current',
      current: true,
      hint: 'ارسال این سفارش متوقف شده است.',
    })
  }

  // Prefer the explicit `current` flag; fall back to the first unfinished step
  // so an order is never reported as merely "placed".
  const current =
    steps.find(step => step.current) ?? steps.find(step => step.state === 'current') ?? steps[steps.length - 1]!
  return { summary: `وضعیت فعلی سفارش: ${current.label}`, steps }
}
