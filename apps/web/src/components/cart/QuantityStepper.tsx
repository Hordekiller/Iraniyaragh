'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { toPersianDigits } from '../../lib/format'
import {
  QUANTITY_COMMIT_DELAY_MS,
  normalizeQuantityDraft,
  parseQuantityDraft,
} from '../../lib/quantity'

type Notice = { tone: 'info' | 'error'; text: string; retry?: number }

type Props = {
  /** The authoritative quantity (server cart line, or the page's own choice before adding). */
  value: number
  min?: number
  /** Highest quantity that may be requested right now. */
  max: number
  /** Why `max` applies, so the message names the real rule. */
  maxReason?: 'stock' | 'limit'
  /** Saves one absolute quantity. A rejected promise is shown as a failed save. */
  onCommit: (quantity: number) => void | Promise<unknown>
  /** When given, the minus button at the minimum removes the item instead of being disabled. */
  onRemove?: () => void | Promise<unknown>
  describeError?: (error: unknown) => string
  disabled?: boolean
  /** Product name used in the group and button labels. */
  itemName?: string
  size?: 'md' | 'sm'
  className?: string
}

const fa = (value: number) => toPersianDigits(value)

/**
 * `[ − ] [ quantity ] [ + ]` with a directly editable quantity.
 *
 * The typed text stays local while editing and is saved as one absolute
 * quantity on Enter, on blur, or shortly after typing stops. The displayed
 * number returns to `value` as soon as a save settles, so a failed or adjusted
 * save is never shown as if it had succeeded.
 */
export function QuantityStepper({
  value,
  min = 1,
  max,
  maxReason = 'limit',
  onCommit,
  onRemove,
  describeError,
  disabled = false,
  itemName,
  size = 'md',
  className = '',
}: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [intended, setIntended] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitSequence = useRef(0)
  const selectOnMouseUp = useRef(false)
  // Enter and Escape settle the edit themselves; their blur must not commit it again.
  const settledByKey = useRef(false)
  const noticeId = useId()

  const shown = intended ?? value
  const typed = draft === null ? null : parseQuantityDraft(draft)
  const base = typed ?? shown
  const unavailable = max < min
  const suffix = itemName ? ` ${itemName}` : ''

  const cancelTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => cancelTimer, [])

  // Keep the caret where the shopper was typing after digits are re-rendered.
  useLayoutEffect(() => {
    const position = caret.current
    caret.current = null
    if (position === null || document.activeElement !== input.current) return
    input.current?.setSelectionRange(position, position)
  })

  const overMaxText = () =>
    maxReason === 'stock'
      ? `فقط ${fa(max)} عدد از این کالا قابل سفارش است؛ تعداد روی ${fa(max)} تنظیم شد.`
      : `حداکثر تعداد هر کالا در سبد ${fa(max)} عدد است؛ تعداد روی ${fa(max)} تنظیم شد.`
  const unavailableText = 'این کالا در حال حاضر موجودی قابل سفارش ندارد.'

  function save(quantity: number) {
    if (quantity === value && intended === null) return
    const sequence = ++commitSequence.current
    setIntended(quantity)
    const settle = (failure?: { error: unknown }) => {
      if (commitSequence.current !== sequence) return
      setIntended(null)
      if (failure)
        setNotice({
          tone: 'error',
          text: `ثبت تعداد ${fa(quantity)} انجام نشد. ${describeError?.(failure.error) ?? 'دوباره تلاش کنید.'}`,
          retry: quantity,
        })
    }
    let outcome: void | Promise<unknown>
    try {
      outcome = onCommit(quantity)
    } catch (error) {
      settle({ error })
      return
    }
    Promise.resolve(outcome).then(
      () => settle(),
      (error: unknown) => settle({ error }),
    )
  }

  /** Validates the typed text and saves it; `final` also leaves edit mode. */
  function commitDraft(final: boolean) {
    cancelTimer()
    if (draft === null) return
    const quantity = parseQuantityDraft(draft)
    if (quantity === null) {
      if (final) setDraft(null)
      return
    }
    if (unavailable) {
      setNotice({ tone: 'error', text: unavailableText })
      if (final) setDraft(null)
      return
    }
    if (quantity < min) {
      setNotice({ tone: 'error', text: `حداقل تعداد ${fa(min)} عدد است.` })
      if (final) setDraft(null)
      return
    }
    if (quantity > max) {
      if (!final) {
        setNotice({
          tone: 'error',
          text:
            maxReason === 'stock'
              ? `فقط ${fa(max)} عدد از این کالا قابل سفارش است.`
              : `حداکثر تعداد هر کالا در سبد ${fa(max)} عدد است.`,
        })
        return
      }
      setNotice({ tone: 'info', text: overMaxText() })
      setDraft(null)
      save(max)
      return
    }
    setNotice(null)
    if (final) setDraft(null)
    save(quantity)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.target
    const raw = element.value
    const position = element.selectionStart ?? raw.length
    const next = normalizeQuantityDraft(raw)
    const previous = draft ?? String(shown)
    if (next === null) {
      // Reject the edit as a whole; the text stays exactly as it was.
      caret.current = Math.max(0, position - (raw.length - previous.length))
      setDraft(previous)
      setNotice({ tone: 'error', text: 'فقط عدد صحیح وارد کنید.' })
      return
    }
    caret.current = (normalizeQuantityDraft(raw.slice(0, position)) ?? next).length
    setDraft(next)
    setNotice(null)
    cancelTimer()
    if (next !== '')
      timer.current = setTimeout(() => commitRef.current(false), QUANTITY_COMMIT_DELAY_MS)
  }

  // The debounce timer must run the latest closure, not the one that armed it.
  const commitRef = useRef(commitDraft)
  useEffect(() => {
    commitRef.current = commitDraft
  })

  function step(delta: 1 | -1) {
    cancelTimer()
    setDraft(null)
    if (delta < 0 && (base <= min || unavailable) && onRemove) {
      setNotice(null)
      Promise.resolve()
        .then(onRemove)
        .catch((error: unknown) =>
          setNotice({
            tone: 'error',
            text: `حذف کالا انجام نشد. ${describeError?.(error) ?? 'دوباره تلاش کنید.'}`,
          }),
        )
      return
    }
    if (unavailable) {
      setNotice({ tone: 'error', text: unavailableText })
      return
    }
    setNotice(null)
    save(Math.min(max, Math.max(min, base + delta)))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft(true)
      settledByKey.current = true
      event.currentTarget.blur()
      settledByKey.current = false
    } else if (event.key === 'Escape') {
      cancelTimer()
      setDraft(null)
      setNotice(null)
      settledByKey.current = true
      event.currentTarget.blur()
      settledByKey.current = false
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const up = event.key === 'ArrowUp'
      if (up ? base < max : base > min) step(up ? 1 : -1)
    }
  }

  const staleText =
    draft === null && intended === null && !disabled && value > max
      ? unavailable
        ? unavailableText
        : maxReason === 'stock'
          ? `فقط ${fa(max)} عدد از این کالا قابل سفارش است؛ تعداد را کاهش دهید.`
          : `حداکثر تعداد هر کالا در سبد ${fa(max)} عدد است؛ تعداد را کاهش دهید.`
      : null
  const message: Notice | null = notice ?? (staleText ? { tone: 'error', text: staleText } : null)
  const invalid = message?.tone === 'error'

  const small = size === 'sm'
  const buttonSize = small ? 'h-9 w-9' : 'h-10 w-10'
  const buttonFocus =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2'

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <div
        role="group"
        aria-label={`تعداد${suffix}`}
        className={`flex items-center gap-1 rounded-full p-1 ${small ? 'border border-slate-300' : 'border-2 border-[#0F172A]'}`}
      >
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || unavailable || base >= max}
          aria-label={`افزایش تعداد${suffix}`}
          className={`flex ${buttonSize} shrink-0 items-center justify-center rounded-full text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 ${small ? 'bg-slate-950' : 'bg-[#0F172A]'} ${buttonFocus}`}
        >
          <Plus size={small ? 15 : 18} aria-hidden="true" />
        </button>
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          // Persian and Arabic-Indic digits are valid input, not just 0-9.
          pattern="[0-9۰-۹٠-٩]*"
          enterKeyHint="done"
          autoComplete="off"
          dir="ltr"
          aria-label={`تعداد محصول${suffix}`}
          aria-describedby={noticeId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          maxLength={8}
          value={toPersianDigits(draft ?? String(shown))}
          onChange={handleChange}
          onFocus={(event) => {
            setDraft((current) => current ?? String(shown))
            selectOnMouseUp.current = true
            event.currentTarget.select()
          }}
          onMouseUp={(event) => {
            // Keep the whole number selected so typing replaces it.
            if (selectOnMouseUp.current) event.preventDefault()
            selectOnMouseUp.current = false
          }}
          onBlur={() => {
            selectOnMouseUp.current = false
            if (!settledByKey.current) commitDraft(true)
          }}
          onKeyDown={handleKeyDown}
          // 16px text keeps iOS Safari from zooming the page on focus.
          className={`${small ? 'h-9' : 'h-10'} w-14 min-w-0 rounded-full bg-transparent text-center text-base font-black text-slate-950 outline-none focus:bg-amber-50 focus:ring-2 focus:ring-amber-500 disabled:opacity-50`}
        />
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || ((base <= min || unavailable) && !onRemove)}
          aria-label={
            (base <= min || unavailable) && onRemove ? `حذف${suffix || ' کالا'} از سبد` : `کاهش تعداد${suffix}`
          }
          className={`flex ${buttonSize} shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 ${small ? 'text-slate-950' : 'text-slate-900'} ${buttonFocus}`}
        >
          <Minus size={small ? 15 : 18} aria-hidden="true" />
        </button>
      </div>
      {/* Takes the selector's width instead of widening the row it sits in. */}
      <div
        id={noticeId}
        aria-live="polite"
        aria-atomic="true"
        className={`w-0 min-w-full text-xs leading-5 ${message ? 'mt-1.5' : ''} ${invalid ? 'font-bold text-red-700' : 'text-slate-600'}`}
      >
        {message?.text}
        {message?.retry !== undefined && (
          <button
            type="button"
            onClick={() => {
              const quantity = message.retry as number
              setNotice(null)
              save(quantity)
            }}
            className={`ms-1 rounded underline ${buttonFocus}`}
          >
            تلاش دوباره
          </button>
        )}
      </div>
    </div>
  )
}
