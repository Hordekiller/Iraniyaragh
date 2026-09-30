import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { formatToman } from '../../lib/format'
import { useSearchSuggestions } from './use-search-suggestions'

/**
 * Renders the open suggestion list. All state lives in `useSearchSuggestions`,
 * which the header inputs drive from their own key handlers.
 *
 * The listbox only ever contains `option` children: the loading, failed and
 * empty messages are rendered beside it as a live status, so assistive tech is
 * never handed an option-less list. Following the APG combobox pattern, the
 * active option is scrolled into view explicitly because `aria-activedescendant`
 * moves the selection without moving any browser scroll.
 */
export function SearchSuggestions({
  rows,
  active,
  setActive,
  term,
  open,
  listOpen,
  loading,
  failed,
  empty,
  listboxId,
  statusId,
  optionId,
  dismiss,
}: ReturnType<typeof useSearchSuggestions>) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (active < 0 || !listRef.current) return
    const option = listRef.current.querySelector<HTMLElement>(`[id="${optionId(active)}"]`)
    option?.scrollIntoView({ block: 'nearest' })
    // `optionId` is rebuilt every render, so the active index and row count are
    // the real inputs to this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rows.length, listOpen])

  if (!open) return null

  return (
    <div className="absolute inset-x-0 top-full z-50 mt-2">
      {listOpen ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="پیشنهاد جست‌وجو"
          className="max-h-80 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
        >
          {rows.map((row, index) => {
            const isAll = row.all === true
            return (
              <li key={row.id} role="none">
                <Link
                  id={optionId(index)}
                  role="option"
                  aria-selected={active === index}
                  to={
                    isAll
                      ? `${ROUTES.search}?q=${encodeURIComponent(term)}`
                      : ROUTES.product(row.slug)
                  }
                  onClick={dismiss}
                  onMouseEnter={() => setActive(index)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-right transition ${
                    active === index ? 'bg-[#6842ff]/10' : 'hover:bg-slate-50'
                  } ${isAll ? 'border-t border-slate-100 font-bold text-[#6842ff]' : ''}`}
                >
                  {isAll ? (
                    <>
                      <Search size={15} aria-hidden="true" className="text-[#6842ff]" />
                      <span className="text-xs">همهٔ نتایج برای «{term}»</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-slate-900">{row.name}</span>
                        {row.brand && (
                          <span className="block truncate text-[11px] text-slate-500">{row.brand}</span>
                        )}
                      </span>
                      {row.amount && (
                        <span className="shrink-0 text-[11px] font-bold text-[#FF4D00]">
                          {formatToman(row.amount)}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div
          id={statusId}
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
        >
          {loading && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {loading && 'در حال یافتن پیشنهادها...'}
          {failed && 'پیشنهادی نمایش داده نشد؛ می‌توانید جست‌وجو را مستقیم انجام دهید.'}
          {empty && 'کالایی با این عبارت پیدا نشد.'}
        </div>
      )}
    </div>
  )
}
