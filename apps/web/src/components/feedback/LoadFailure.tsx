import { RotateCcw } from 'lucide-react'
import { LOAD_FAILURE_MESSAGE } from '../../lib/load-error'

type LoadFailureProps = {
  /** Re-runs the failed request. */
  onRetry: () => void
  /** Overrides the default "could not load" copy. */
  message?: string
  title?: string
}

/**
 * The single failure state for a data-driven screen.
 *
 * Replaces the "try again" text that used to ship without a way to actually try
 * again, and replaces the copy that used to claim a missing record whenever the
 * request merely failed.
 */
export function LoadFailure({ onRetry, message, title = 'دریافت اطلاعات انجام نشد' }: LoadFailureProps) {
  return (
    <div
      role="alert"
      className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-center"
    >
      <h1 className="font-black text-red-800 text-sm">{title}</h1>
      <p className="mt-1 text-red-700 text-[13px] leading-6">{message ?? LOAD_FAILURE_MESSAGE}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white border border-red-200 text-red-800 font-bold text-[13px] hover:border-red-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
      >
        <RotateCcw size={15} aria-hidden="true" />
        تلاش دوباره
      </button>
    </div>
  )
}
