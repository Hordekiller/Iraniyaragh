import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchSuggestions } from './SearchSuggestions'
import { useSearchSuggestions } from './use-search-suggestions'
import { CatalogProvider } from '../../state/CatalogProvider'
import { CatalogFixtureClient } from '../../services/catalog/fixtures'

/**
 * Drives the real hook and the real list together so the combobox contract is
 * exercised end to end, not just the markup in isolation. The harness mirrors
 * `SiteHeader`: same ARIA wiring and the same Enter handling.
 */
function Harness({ query }: { query: string }) {
  const suggestions = useSearchSuggestions(query, 'test-search')
  const location = useLocation()
  return (
    <div>
      <input
        id="test-search"
        value={query}
        readOnly
        onKeyDown={event => {
          suggestions.onKeyDown(event)
          if (event.key !== 'Enter') return
          event.preventDefault()
          if (suggestions.acceptActive()) return
        }}
        role="combobox"
        aria-expanded={suggestions.listOpen}
        aria-controls={suggestions.listOpen ? suggestions.listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={suggestions.activeDescendant}
      />
      <SearchSuggestions {...suggestions} />
      <div data-testid="location">{location.pathname}{location.search}</div>
    </div>
  )
}

function renderBox(query: string) {
  return render(
    <MemoryRouter>
      <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
        <Harness query={query} />
      </CatalogProvider>
    </MemoryRouter>,
  )
}

describe('SearchSuggestions', () => {
  beforeEach(() => {
    // jsdom has no layout, so the APG scroll-into-view step needs a stub to be
    // observable at all.
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows no listbox until the term is long enough to search', () => {
    renderBox('a')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('offers live products as suggestions and a route to all results', async () => {
    renderBox('دریل')

    const options = await screen.findAllByRole('option')
    expect(options.length).toBeGreaterThan(1)

    // The last row is the escape hatch to the full result set.
    const all = options[options.length - 1]!
    expect(all).toHaveAttribute('href', expect.stringContaining('/search?q='))
  })

  it('marks the input as an expanded combobox pointing at the listbox', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'))
    expect(input).toHaveAttribute('aria-controls', 'test-search-suggestions')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('moves the active option with the arrow keys and exposes it via aria-activedescendant', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'test-search-suggestions-0')
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute(
      'id',
      'test-search-suggestions-0',
    )

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'test-search-suggestions-1')
  })

  it('wraps back to the first option from the top', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    const options = await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', `test-search-suggestions-${options.length - 1}`)
  })

  it('closes the list on Escape', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('sends each suggestion to a real product route', async () => {
    renderBox('دریل')
    const first = (await screen.findAllByRole('option'))[0]!
    expect(first.getAttribute('href')).toMatch(/^\/product\//)
  })

  it('keeps every listbox child an option, moving the no-results message out', async () => {
    renderBox('دریل')
    const listbox = await screen.findByRole('listbox')
    expect(Array.from(listbox.children).every(child => child.getAttribute('role') === 'none')).toBe(true)
  })

  it('exposes a pending lookup as a status instead of an empty listbox', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    // Before the debounce resolves there is no listbox to expose, and the input
    // must not claim to have one.
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')
  })

  it('reports an empty result as a status, not as an option-less listbox', async () => {
    renderBox('zzzzqqq')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('پیدا نشد'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('scrolls the active option into view, because aria-activedescendant does not', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    const scrolled = vi.mocked(Element.prototype.scrollIntoView).mock.instances[0] as HTMLElement
    expect(scrolled.id).toBe('test-search-suggestions-0')
    expect(vi.mocked(Element.prototype.scrollIntoView)).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('jumps to the first and last option with Home and End', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    const options = await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'End' })
    expect(input).toHaveAttribute('aria-activedescendant', `test-search-suggestions-${options.length - 1}`)

    fireEvent.keyDown(input, { key: 'Home' })
    expect(input).toHaveAttribute('aria-activedescendant', 'test-search-suggestions-0')
  })

  it('opens the list on the first suggestion with Alt+ArrowDown', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', 'test-search-suggestions-0')

    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
    expect(input).toHaveAttribute('aria-activedescendant', 'test-search-suggestions-0')
  })

  it('opens the list on the last suggestion with Alt+ArrowUp', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    const options = await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    fireEvent.keyDown(input, { key: 'ArrowUp', altKey: true })
    expect(input).toHaveAttribute('aria-activedescendant', `test-search-suggestions-${options.length - 1}`)
  })

  it('navigates to the active suggestion on Enter instead of searching the term', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    const options = await screen.findAllByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    const expected = options[0]!.getAttribute('href')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(expected!))
  })

  it('sends Enter to the search page when the all-results row is active', async () => {
    renderBox('دریل')
    const input = screen.getByRole('combobox')
    await screen.findAllByRole('option')

    // End highlights the trailing "see all results" row.
    fireEvent.keyDown(input, { key: 'End' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/search?q='))
  })

  it('leaves the caret keys alone while the list is shut', async () => {
    renderBox('a')
    const input = screen.getByRole('combobox')
    const notPrevented = fireEvent.keyDown(input, { key: 'Home' })
    expect(notPrevented).toBe(true)
  })
})
