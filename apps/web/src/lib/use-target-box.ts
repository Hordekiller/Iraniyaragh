import { useEffect, useState } from 'react'

export interface TargetBox { top: number; left: number; width: number; height: number }
interface Measured { selector: string; box: TargetBox | null; element: HTMLElement | null }

const PAD = 6

export function firstVisible(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>
  try { nodes = document.querySelectorAll<HTMLElement>(selector) } catch { return null }
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0 && node.getClientRects().length > 0) return node
  }
  return null
}

function sameBox(a: TargetBox | null, b: TargetBox | null) {
  return a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)
}

/**
 * Follows the first visible element matching `selector` (dialogs open, pages load,
 * layout shifts) and scrolls it into view once when it first appears. Measurements
 * are tagged with their selector so a stale box is never shown for a new step.
 */
export function useTargetBox(selector: string | undefined, resetKey?: unknown) {
  const [measured, setMeasured] = useState<Measured | null>(null)
  const box = measured && measured.selector === selector ? measured.box : null
  const element = measured && measured.selector === selector ? measured.element : null

  useEffect(() => {
    if (!selector) return
    let frame = 0
    const measure = () => {
      frame = 0
      const found = firstVisible(selector)
      const rect = found?.getBoundingClientRect()
      const next = rect ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null
      setMeasured(previous => previous && previous.selector === selector && previous.element === found && sameBox(previous.box, next) ? previous : { selector, box: next, element: found })
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    const timer = window.setInterval(schedule, 250)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      window.clearInterval(timer)
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [selector, resetKey])

  useEffect(() => {
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      element.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [element])

  return { box, element }
}
