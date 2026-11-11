import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QUANTITY_COMMIT_DELAY_MS } from '../../lib/quantity'
import { QuantityStepper } from './QuantityStepper'

type Commit = (quantity: number) => void | Promise<unknown>

function Harness({ start = 1, max = 999_999, onCommit, onRemove, maxReason }: {
  start?: number
  max?: number
  onCommit?: Commit
  onRemove?: () => void
  maxReason?: 'stock' | 'limit'
}) {
  const [value, setValue] = useState(start)
  return (
    <QuantityStepper
      value={value}
      max={max}
      maxReason={maxReason}
      onRemove={onRemove}
      onCommit={async (quantity) => {
        await onCommit?.(quantity)
        setValue(quantity)
      }}
    />
  )
}

const field = () => screen.getByRole('textbox', { name: 'تعداد محصول' }) as HTMLInputElement
const plus = () => screen.getByRole('button', { name: 'افزایش تعداد' })
const minus = () => screen.getByRole('button', { name: 'کاهش تعداد' })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

async function typeAndEnter(text: string) {
  const input = field()
  act(() => input.focus())
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await flush()
}

describe('QuantityStepper', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('exposes the attributes that open the numeric keyboard and avoid iOS zoom', () => {
    render(<Harness />)
    const input = field()
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('type', 'text')
    expect(input.getAttribute('pattern')).toContain('0-9')
    expect(input.className).toContain('text-base')
  })

  it.each([
    ['100', 100, '۱۰۰'],
    ['1000', 1000, '۱۰۰۰'],
    ['25000', 25000, '۲۵۰۰۰'],
    ['۱۲۵', 125, '۱۲۵'],
    ['١٢٥', 125, '۱۲۵'],
  ])('commits %s once as exactly %i', async (text, quantity, shown) => {
    const onCommit = vi.fn()
    render(<Harness onCommit={onCommit} />)
    await typeAndEnter(text)
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith(quantity)
    expect(field().value).toBe(shown)
  })

  it('selects the current number on focus so typing replaces it', () => {
    render(<Harness start={42} />)
    const input = field()
    act(() => input.focus())
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('allows an empty field while editing and restores the quantity on blur', async () => {
    const onCommit = vi.fn()
    render(<Harness start={7} onCommit={onCommit} />)
    const input = field()
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    act(() => vi.advanceTimersByTime(QUANTITY_COMMIT_DELAY_MS * 2))
    expect(input.value).toBe('')
    act(() => input.blur())
    await flush()
    expect(input.value).toBe('۷')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it.each(['12a', '-5', '1.5'])('refuses %s with a Persian message', (text) => {
    const onCommit = vi.fn()
    render(<Harness start={3} onCommit={onCommit} />)
    const input = field()
    act(() => input.focus())
    fireEvent.change(input, { target: { value: text } })
    expect(input.value).toBe('۳')
    expect(screen.getByText('فقط عدد صحیح وارد کنید.')).toBeInTheDocument()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('refuses zero, explains the minimum and keeps the quantity', async () => {
    const onCommit = vi.fn()
    render(<Harness start={4} onCommit={onCommit} />)
    await typeAndEnter('0')
    expect(onCommit).not.toHaveBeenCalled()
    expect(field().value).toBe('۴')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('حداقل تعداد ۱ عدد است.')).toBeInTheDocument()
  })

  it('caps a quantity above stock and states the allowed amount', async () => {
    const onCommit = vi.fn()
    render(<Harness max={40} maxReason="stock" onCommit={onCommit} />)
    await typeAndEnter('100')
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(40)
    expect(field().value).toBe('۴۰')
    expect(screen.getByText(/فقط ۴۰ عدد از این کالا قابل سفارش است/)).toBeInTheDocument()
  })

  it('debounces typing into one commit of the final number', async () => {
    const onCommit = vi.fn()
    render(<Harness onCommit={onCommit} />)
    const input = field()
    act(() => input.focus())
    for (const text of ['1', '10', '100']) {
      fireEvent.change(input, { target: { value: text } })
      act(() => vi.advanceTimersByTime(QUANTITY_COMMIT_DELAY_MS / 2))
    }
    expect(onCommit).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(QUANTITY_COMMIT_DELAY_MS))
    await flush()
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(100)
    expect(input.value).toBe('۱۰۰')
  })

  it('does not commit twice when Enter blurs the field', async () => {
    const onCommit = vi.fn()
    render(<Harness onCommit={onCommit} />)
    await typeAndEnter('55')
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('discards the edit on Escape', async () => {
    const onCommit = vi.fn()
    render(<Harness start={9} onCommit={onCommit} />)
    const input = field()
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await flush()
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('۹')
  })

  it('keeps plus and minus in step after a manual edit', async () => {
    const onCommit = vi.fn()
    render(<Harness onCommit={onCommit} />)
    await typeAndEnter('100')
    fireEvent.click(plus())
    await flush()
    expect(onCommit).toHaveBeenLastCalledWith(101)
    fireEvent.click(minus())
    await flush()
    expect(onCommit).toHaveBeenLastCalledWith(100)
    expect(field().value).toBe('۱۰۰')
  })

  it('disables plus at the maximum and minus at the minimum', () => {
    const { unmount } = render(<Harness start={5} max={5} />)
    expect(plus()).toBeDisabled()
    unmount()
    render(<Harness start={1} max={5} />)
    expect(minus()).toBeDisabled()
  })

  it('offers removal from minus at the minimum when the caller allows it', async () => {
    const onRemove = vi.fn()
    render(<Harness start={1} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف کالا از سبد' }))
    await flush()
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('supports arrow keys within the limits', async () => {
    const onCommit = vi.fn()
    render(<Harness start={5} max={6} onCommit={onCommit} />)
    const input = field()
    act(() => input.focus())
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    await flush()
    expect(onCommit).toHaveBeenLastCalledWith(6)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    await flush()
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('shows a failed save as failed, restores the server value and can retry the intent', async () => {
    const onCommit = vi.fn<Commit>().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined)
    render(<Harness start={2} onCommit={onCommit} />)
    await typeAndEnter('100')
    await flush()
    expect(field().value).toBe('۲')
    expect(screen.getByText(/ثبت تعداد ۱۰۰ انجام نشد/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await flush()
    await flush()
    expect(onCommit).toHaveBeenLastCalledWith(100)
    expect(field().value).toBe('۱۰۰')
  })

  it('connects validation messages to the field for screen readers', async () => {
    render(<Harness start={4} />)
    await typeAndEnter('0')
    const described = field().getAttribute('aria-describedby') as string
    const region = document.getElementById(described)
    expect(region).toHaveTextContent('حداقل تعداد')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('names each cart line in its labels', () => {
    render(<QuantityStepper value={1} max={5} itemName="دریل" onCommit={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'تعداد محصول دریل' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'تعداد دریل' })).toBeInTheDocument()
  })
})
