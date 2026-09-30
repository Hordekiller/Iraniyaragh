import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalogApi } from '../../state/catalog-context'
import { ROUTES } from '../../lib/routes'


export type Suggestion = { id: string; name: string; slug: string; brand: string | null; amount: string | null; all?: true }

export const MIN_TERM = 2
const MAX_SUGGESTIONS = 6

/**
 * Live search suggestions for the header search box.
 *
 * Every row is a real product returned by the catalog search endpoint — no
 * canned or invented terms — and each one is a link to that product's real
 * route. The "see all results" row goes to the search page, so the customer
 * always has a way to see the full result set.
 *
 * Implements the WAI-ARIA APG combobox pattern: the input keeps focus while the
 * listbox is open, arrow keys move the active option, Enter accepts it, Escape
 * closes the list, and the active row is referenced by `aria-activedescendant`.
 * `aria-expanded` only tracks the listbox itself, so the loading/failed/empty
 * messages are exposed as a live status instead of as empty `option` rows.
 */
export function useSearchSuggestions(query: string, inputId: string) {
  const api = useCatalogApi()
  const navigate = useNavigate()
  const term = query.trim()
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [active, setActive] = useState(-1)
  const [failed, setFailed] = useState(false)
  // Closing the popup must not throw the fetched rows away: the APG pattern
  // requires Alt+Arrow to reopen the list straight away. Tracking the term that
  // was closed (rather than a boolean) means typing a new term reopens the list
  // with no effect needed to reset anything.
  const [closedFor, setClosedFor] = useState<string | null>(null)
  const listboxId = `${inputId}-suggestions`
  const statusId = `${listboxId}-status`
  const optionId = (index: number) => `${listboxId}-${index}`
  const requestRef = useRef(0)

  useEffect(() => {
    if (term.length < MIN_TERM) {
      // Reset through a microtask so this stays an async transition rather than
      // a synchronous setState during the effect.
      queueMicrotask(() => {
        setItems(null)
        setFailed(false)
      })
      return undefined
    }
    // A newer keystroke invalidates any in-flight response.
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    let cancelled = false
    const timer = setTimeout(() => {
      api
        .listProducts({ search: term, sortBy: 'newest', perPage: MAX_SUGGESTIONS })
        .then(result => {
          if (cancelled || requestRef.current !== requestId) return
          setFailed(false)
          setItems(
            result.items.slice(0, MAX_SUGGESTIONS).map(product => ({
              id: product.id,
              name: product.name,
              slug: product.slug,
              brand: product.brand,
              amount: product.price.amount,
            })),
          )
          setActive(-1)
        })
        .catch(() => {
          if (cancelled || requestRef.current !== requestId) return
          // A failed suggestion lookup must never block typing or submitting.
          setItems(null)
          setFailed(true)
        })
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [api, term])

  const rows = useMemo<Array<Suggestion & { all?: true }>>(() => {
    if (!items || items.length === 0) return []
    return [...items, { id: '__all__', name: 'همهٔ نتایج', slug: '', brand: null, amount: null, all: true }]
  }, [items])

  const hasOptions = rows.length > 0
  // The popup is visible while the lookup is in flight or produced nothing, but
  // only a populated list is a real listbox.
  const open = term.length >= MIN_TERM && closedFor !== term
  const listOpen = open && hasOptions

  /** Navigates to the active option's real route. Called from the Enter key. */
  function acceptActive() {
    if (active < 0) return false
    const row = rows[active]
    if (!row) return false
    navigate(row.all ? `${ROUTES.search}?q=${encodeURIComponent(term)}` : ROUTES.product(row.slug))
    dismiss()
    return true
  }

  /**
   * Arrow keys move the active option; Escape closes the list. Home/End and
   * Alt+Arrow are the APG shortcuts for first/last option and for reopening the
   * list while typing.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Escape must also work while the lookup is still in flight, so it is
    // handled before the empty-rows guard below.
    if (event.key === 'Escape') {
      setActive(-1)
      dismiss()
      return
    }
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (!hasOptions) return
      event.preventDefault()
      setClosedFor(null)
      setActive(event.key === 'ArrowDown' ? 0 : rows.length - 1)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      // Only claim the caret keys while the list is actually open, so a
      // customer editing a term can still jump to the start/end of the field.
      if (!listOpen) return
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : rows.length - 1)
      return
    }
    if (!hasOptions) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setClosedFor(null)
      setActive(current => (current + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setClosedFor(null)
      setActive(current => (current <= 0 ? rows.length - 1 : current - 1))
    }
  }

  function dismiss() {
    setActive(-1)
    setClosedFor(term)
  }

  return {
    rows,
    active,
    setActive,
    term,
    /** True while the popup (listbox or status message) is on screen. */
    open,
    /** True only when the listbox itself holds options. */
    listOpen,
    loading: items === null && !failed && term.length >= MIN_TERM,
    failed,
    empty: items !== null && items.length === 0,
    listboxId,
    statusId,
    optionId,
    activeDescendant: active >= 0 ? optionId(active) : undefined,
    acceptActive,
    onKeyDown,
    dismiss,
  }
}

