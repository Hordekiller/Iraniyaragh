import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})