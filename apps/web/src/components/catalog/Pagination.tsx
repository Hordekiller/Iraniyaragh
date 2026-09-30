import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toPersianDigits } from '../../lib/format'

/**
 * Window of page numbers to render around the current page. Narrow on purpose:
 * the control is a 44px-tall row on a 360px screen, so it must not push the
 * product grid off-screen on mobile.
 */
function pageWindow(current: number, total: number, size: number): number[] {
  if (total <= size) return Array.from({ length: total }, (_, index) => index + 1)
  let start = Math.max(1, current - Math.floor(size / 2))
  const end = Math.min(total, start + size - 1)
  start = Math.max(1, end - size + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function Pagination({
  page,
  pages,
  total,
  perPage,
  onChange,
  busy = false,
  label = 'صفحه‌بندی نتایج',
}: {
  page: number
  pages: number
  total: number
  perPage: number
  onChange: (page: number) => void
  /** True while the next page is loading: controls are disabled, numbers stale. */
  busy?: boolean
  label?: string
}) {
  if (pages <= 1) return null

  const first = total === 0 ? 0 : (page - 1) * perPage + 1
  const last = Math.min(page * perPage, total)
  const canPrevious = !busy && page > 1
  const canNext = !busy && page < pages

  const navButton =
    'h-10 min-w-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-black inline-flex items-center justify-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]'

  return (
    <nav aria-label={label} aria-busy={busy || undefined} className="mt-8 flex flex-col items-center gap-3">
      <p className="text-xs text-slate-500" aria-live="polite">
        نمایش {toPersianDigits(first)} تا {toPersianDigits(last)} از {toPersianDigits(total)} کالا
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={navButton}
          onClick={() => onChange(page - 1)}
          disabled={!canPrevious}
          aria-label="صفحه قبل"
        >
          <ChevronRight size={16} aria-hidden="true" />
          <span className="hidden sm:inline">قبلی</span>
        </button>

        <ul className="flex items-center gap-1.5">
          {pageWindow(page, pages, 5).map(value => (
            <li key={value}>
              <button
                type="button"
                onClick={() => onChange(value)}
                disabled={busy}
                aria-current={value === page ? 'page' : undefined}
                aria-label={`صفحه ${toPersianDigits(value)}`}
                className={`h-10 min-w-10 px-2 rounded-xl text-xs font-black inline-flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] ${
                  value === page ? 'bg-[#C2410C] text-white' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-900'
                }`}
              >
                {toPersianDigits(value)}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className={navButton}
          onClick={() => onChange(page + 1)}
          disabled={!canNext}
          aria-label="صفحه بعد"
        >
          <span className="hidden sm:inline">بعدی</span>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
