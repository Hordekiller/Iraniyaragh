import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('renders nothing for a single page so a short catalog has no dead control', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Pagination page={1} pages={1} total={12} perPage={24} onChange={onChange} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('states the visible range and total in Persian digits', () => {
    render(<Pagination page={2} pages={5} total={100} perPage={24} onChange={vi.fn()} />)
    expect(screen.getByText('نمایش ۲۵ تا ۴۸ از ۱۰۰ کالا')).toBeInTheDocument()
  })

  it('disables the previous control on the first page and the next control on the last', () => {
    const { rerender } = render(<Pagination page={1} pages={3} total={60} perPage={24} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'صفحه قبل' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'صفحه بعد' })).toBeEnabled()

    rerender(<Pagination page={3} pages={3} total={60} perPage={24} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'صفحه قبل' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'صفحه بعد' })).toBeDisabled()
  })

  it('marks the current page for assistive technology', () => {
    render(<Pagination page={2} pages={5} total={100} perPage={24} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'صفحه ۲' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'صفحه ۱' })).not.toHaveAttribute('aria-current')
  })

  it('keeps the button window small around the current page', () => {
    render(<Pagination page={10} pages={40} total={960} perPage={24} onChange={vi.fn()} />)
    // A 40-page listing must not render 40 buttons and overflow a 360px screen.
    expect(screen.getAllByRole('button', { name: /^صفحه [۰-۹]+$/ })).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'صفحه ۱۰' })).toBeInTheDocument()
  })

  it('reports the requested page', () => {
    const onChange = vi.fn()
    render(<Pagination page={1} pages={5} total={100} perPage={24} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'صفحه ۳' }))
    expect(onChange).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: 'صفحه بعد' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('clamps the window at the last page', () => {
    render(<Pagination page={40} pages={40} total={960} perPage={24} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'صفحه ۴۰' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'صفحه ۳۶' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'صفحه ۴۱' })).not.toBeInTheDocument()
  })
})
