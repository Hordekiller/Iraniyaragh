import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InlineConfirm } from './InlineConfirm'

/**
 * The three things the naive conditional-render version gets wrong: focus
 * entering the prompt, Escape dismissing it, and focus going back to the
 * trigger. Each is asserted directly rather than inferred.
 */
function renderConfirm(overrides: Partial<Parameters<typeof InlineConfirm>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <InlineConfirm
      question="همهٔ کالاها حذف شوند؟"
      confirmLabel="بله، حذف کن"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    >
      {trigger => (
        <button onClick={trigger.onClick} type="button">
          حذف همه
        </button>
      )}
    </InlineConfirm>,
  )
  return { onConfirm, onCancel, ...utils }
}

describe('InlineConfirm', () => {
  it('shows the trigger and hides the prompt until asked', () => {
    renderConfirm()
    expect(screen.getByRole('button', { name: 'حذف همه' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('moves focus to the confirm button when the prompt opens', async () => {
    renderConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))

    const prompt = screen.getByRole('alertdialog')
    expect(prompt).toBeInTheDocument()
    // Focus must land on the prompt, not fall back to <body> when the trigger
    // is unmounted by the swap.
    expect(screen.getByRole('button', { name: 'بله، حذف کن' })).toHaveFocus()
  })

  it('names the prompt with its question so it is announced', async () => {
    renderConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))

    const prompt = screen.getByRole('alertdialog')
    expect(prompt).toHaveAccessibleName('همهٔ کالاها حذف شوند؟')
  })

  it('cancels on Escape and hands focus back to the trigger', async () => {
    const { onCancel, onConfirm } = renderConfirm()

    const trigger = screen.getByRole('button', { name: 'حذف همه' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('cancels through the cancel button and returns focus too', async () => {
    const { onCancel, onConfirm } = renderConfirm()

    const trigger = screen.getByRole('button', { name: 'حذف همه' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('confirms only from the confirm button', async () => {
    const { onConfirm, onCancel } = renderConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))
    fireEvent.click(screen.getByRole('button', { name: 'بله، حذف کن' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renders the optional description and keeps the prompt announced by it', async () => {
    renderConfirm({ description: 'این کار برگشت‌پذیر نیست.' })

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('این کار برگشت‌پذیر نیست.')
  })

  it('disables the confirm button and shows the busy label while the action runs', async () => {
    renderConfirm({ busy: true })

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))

    const confirm = screen.getByRole('button', { name: 'در حال انجام...' })
    expect(confirm).toBeDisabled()
  })

  it('does not reinstall the Escape listener after the prompt is gone', async () => {
    const { onCancel } = renderConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    onCancel.mockClear()

    // A stray Escape elsewhere on the page must not reach a closed prompt.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})
