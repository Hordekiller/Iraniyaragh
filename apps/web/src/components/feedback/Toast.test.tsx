import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useToast } from './toast-context'
import { ToastProvider } from './Toast'

function Trigger({ message = 'پیام تست' }: { message?: string }) {
  const { show } = useToast()
  return (
    <button type="button" onClick={() => show(message)}>
      نمایش
    </button>
  )
}

describe('ToastProvider', () => {
  it('shows the message and auto-dismisses after the duration', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'نمایش' }))
    expect(await screen.findByRole('status')).toHaveTextContent('پیام تست')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), {
      timeout: 8000,
    })
  }, 12000)

  it('keeps the checkmark and message as one readable text block (e2e regression)', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'نمایش' }))
    expect(await screen.findByRole('status')).toHaveTextContent('پیام تست')
    expect(screen.getByText('✓ پیام تست', { exact: true })).toBeInTheDocument()
  })

  it('dismisses immediately via the focusable close control', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'نمایش' }))
    expect(await screen.findByRole('status')).toHaveTextContent('پیام تست')

    const close = screen.getByRole('button', { name: 'بستن اعلان' })
    fireEvent.click(close)

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), {
      timeout: 2000,
    })
  })

  it('pauses dismissal while hovered and resumes after leaving', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'نمایش' }))
    const toast = await screen.findByRole('status')

    fireEvent.mouseEnter(toast)
    await new Promise(resolve => setTimeout(resolve, 3200))
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.mouseLeave(toast)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), {
      timeout: 6000,
    })
  }, 20000)

  it('shows a newer message over an older one', async () => {
    render(
      <ToastProvider>
        <Trigger message="اول" />
        <Trigger message="دوم" />
      </ToastProvider>,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'نمایش' })[0])
    expect(await screen.findByRole('status')).toHaveTextContent('اول')

    fireEvent.click(screen.getAllByRole('button', { name: 'نمایش' })[1])
    expect(await screen.findByRole('status')).toHaveTextContent('دوم')
  })

  it('drops the entrance animation for customers who asked for reduced motion', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
    ) as unknown as typeof window.matchMedia

    try {
      render(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'نمایش' }))

      const toast = await screen.findByRole('status')
      // The toast is still announced; only the movement is dropped.
      expect(toast).toHaveTextContent('پیام تست')
      expect(JSON.stringify(toast.getAttribute('style'))).toContain('opacity')
      // No transform/scale: those are the parts that read as movement.
      expect(JSON.stringify(toast.getAttribute('style'))).not.toContain('translate')
      expect(JSON.stringify(toast.getAttribute('style'))).not.toContain('scale')
    } finally {
      window.matchMedia = original
    }
  })
})
