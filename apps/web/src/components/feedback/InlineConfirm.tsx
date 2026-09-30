import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

type InlineConfirmProps = {
  /** The question shown once the inline confirmation is open. */
  question: ReactNode
  /** Extra explanation, for irreversible or wide-reaching actions. */
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busyLabel?: string
  busy?: boolean
  onConfirm: () => void
  /** Called on every dismissal: Escape and the cancel button are the same act. */
  onCancel: () => void
  tone?: 'danger' | 'default'
  confirmClassName?: string
  cancelClassName?: string
  /**
   * Renders the trigger control. The trigger is always mounted — this component
   * only hides it while the prompt is open — so the same DOM node is still there
   * to take focus back on dismissal, which is why the caller keeps rendering it
   * instead of swapping it for the prompt.
   */
  children: (trigger: { onClick: () => void }) => ReactNode
}

/** Focusable descendants, in the order the browser would tab through them. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

const DEFAULT_CONFIRM_CLASS =
  'h-9 px-4 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500'
const DEFAULT_CANCEL_CLASS =
  'h-9 px-4 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500'

/**
 * An inline (non-modal) destructive-action confirmation.
 *
 * A modal would be overkill for a two-button prompt, but a plain conditional
 * render is not enough for a keyboard or screen-reader user, so this handles
 * the three things the naive version gets wrong:
 *
 * 1. **Focus moves to the confirmation.** Opening it hides the trigger, so
 *    without this focus silently falls back to `<body>` and the prompt is never
 *    announced.
 * 2. **Escape cancels**, so the prompt is dismissible without hunting for the
 *    cancel button. No focus trap is added on purpose: this is not a modal, and
 *    trapping focus in one would be wrong.
 * 3. **Focus returns to the trigger** on dismissal, so the keyboard position is
 *    not lost (WCAG 2.4.3 Focus Order).
 *
 * `role="alertdialog"` is deliberate — it is announced assertively without
 * moving the virtual cursor the way a real `dialog` would.
 */
export function InlineConfirm({
  question,
  description,
  confirmLabel,
  cancelLabel = 'انصراف',
  busyLabel = 'در حال انجام...',
  busy = false,
  onConfirm,
  onCancel,
  tone = 'danger',
  confirmClassName,
  cancelClassName,
  children,
}: InlineConfirmProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const questionId = useId()

  // Escape and the cancel button must be indistinguishable to the parent: both
  // are a dismissal, and only the parent knows what "dismissed" means.
  const openTrigger = useCallback(() => setOpen(true), [])

  const dismiss = useCallback(() => {
    onCancel()
    setOpen(false)
  }, [onCancel])

  // Move focus to the confirmation as soon as it exists, and hand it back to
  // the (still mounted) trigger as soon as the prompt is gone.
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus()
      return
    }
    triggerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismiss, open])

  return (
    <>
      {/*
        The trigger stays mounted in a stable position and is only hidden, so
        the very same DOM node can take focus back on dismissal. Swapping it out
        for the prompt would remount it, and a remounted node is a different
        node: focus would land on a replacement, not on the control the customer
        actually pressed. `display: contents` keeps the wrapper out of layout, so
        the trigger's own flex/grid parent is unaffected.
      */}
      <span ref={triggerRef} style={{ display: open ? 'none' : 'contents' }}>
        {children({ onClick: openTrigger })}
      </span>

      {open && (
        <div
          role="alertdialog"
          aria-labelledby={questionId}
          className={
            tone === 'danger'
              ? 'rounded-2xl border border-red-200 bg-red-50 p-4'
              : 'rounded-2xl border border-slate-200 bg-slate-50 p-4'
          }
        >
          <p
            id={questionId}
            className={`text-sm font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-800'}`}
          >
            {question}
          </p>
          {description ? (
            <p
              className={`mt-1 text-xs leading-6 ${tone === 'danger' ? 'text-red-700/90' : 'text-slate-600'}`}
            >
              {description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={confirmClassName ?? DEFAULT_CONFIRM_CLASS}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className={cancelClassName ?? DEFAULT_CANCEL_CLASS}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
