import type { OrderDetail } from '@iranyaragh/contracts'
import { formatTimestamp, toPersianDigits } from '../../lib/format'
import { buildTracking, timelineLabel } from './tracking'
import type { Step } from './tracking'

/**
 * Order tracking.
 *
 * Two distinct things are rendered and they are deliberately not mixed:
 *
 * 1. The **server timeline** (`order.timeline`) — the authoritative history the
 *    API returned, with real timestamps. Nothing is filtered or synthesised.
 * 2. A **derived progress stepper** — where the order stands right now, computed
 *    only from the reported `status` / `payment` / `fulfillment` values.
 *
 * No carrier name, tracking code or delivery date is shown: the order contract
 * carries none, so any such value would be invented. The copy says so instead.
 */

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-4">
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              aria-hidden="true"
              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 ${
                step.state === 'done'
                  ? 'bg-emerald-600 border-emerald-600'
                  : step.current
                    ? 'bg-white border-[#FF4D00] ring-4 ring-[#FF4D00]/15'
                    : step.state === 'blocked'
                      ? 'bg-slate-200 border-slate-300'
                      : 'bg-white border-slate-300'
              }`}
            />
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`w-0.5 flex-1 min-h-6 ${step.state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`}
              />
            )}
          </div>
          <div className="pb-4 min-w-0">
            <div
              className={`text-sm font-bold ${
                step.state === 'todo' || step.state === 'blocked' ? 'text-slate-500' : 'text-slate-900'
              }`}
            >
              {step.label}
              {step.current && (
                <span className="mr-2 rounded-full bg-[#FF4D00]/10 text-[#C2410C] px-2 py-0.5 text-[10px] font-bold">
                  وضعیت فعلی
                </span>
              )}
            </div>
            {step.at && <div className="text-[11px] text-slate-500 mt-0.5">{formatTimestamp(step.at)}</div>}
            {step.hint && <div className="text-[11px] text-slate-500 mt-0.5 leading-5">{step.hint}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function OrderTracking({ order }: { order: OrderDetail }) {
  const { summary, steps } = buildTracking(order)
  const timeline = [...order.timeline].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const done = steps.filter(step => step.state === 'done').length

  return (
    <section aria-labelledby="order-tracking-heading" className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5">
      <h2 id="order-tracking-heading" className="font-black text-slate-900 text-sm">
        پیگیری سفارش
      </h2>
      <p className="sr-only" role="status">
        {summary}
      </p>

      <Stepper steps={steps} />

      <p className="text-[11px] leading-5 text-slate-500">
        {toPersianDigits(done)} مرحله از {toPersianDigits(steps.length)} مرحله انجام شده است. اطلاعات مرسوله و کد
        رهگیری در این سفارش ثبت نشده است.
      </p>

      {timeline.length > 0 ? (
        <details className="mt-4 border-t border-slate-100 pt-4">
          <summary className="cursor-pointer text-xs font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] rounded">
            تاریخچهٔ تغییرات ({toPersianDigits(timeline.length)})
          </summary>
          <ol className="mt-3 space-y-2">
            {timeline.map((entry, index) => (
              <li key={`${entry.domain}-${entry.createdAt}-${index}`} className="text-xs text-slate-600">
                <span className="font-bold text-slate-800">{timelineLabel(entry)}</span>
                <span className="text-slate-500"> · {formatTimestamp(entry.createdAt)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-4 text-[11px] text-slate-500">
          تاریخچهٔ تغییرات برای این سفارش ثبت نشده است.
        </p>
      )}

      {order.truncation.timeline && (
        <p role="status" className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          تاریخچهٔ این سفارش طولانی است و فقط بخشی از آن نمایش داده می‌شود.
        </p>
      )}
    </section>
  )
}
