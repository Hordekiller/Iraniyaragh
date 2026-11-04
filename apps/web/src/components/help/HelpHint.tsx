'use client'

import { CircleHelp } from 'lucide-react'
import { requestHelp } from '../../lib/help-tour-state'

/**
 * Small "?" beside a field or heading. It opens the page helper on that exact
 * element, so help is one tap away everywhere without a permanent panel.
 */
export function HelpHint({ target, label }: { target: string; label: string }) {
  return <button type="button" onClick={() => requestHelp(target)} aria-label={`راهنما: ${label}`}
    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 align-middle hover:border-orange-400 hover:text-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]">
    <CircleHelp size={15} aria-hidden="true" />
  </button>
}
