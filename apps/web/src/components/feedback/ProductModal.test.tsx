import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Product } from '../../types/content'
import { ProductModal } from './ProductModal'
import { ToastProvider } from './Toast'

const SAMPLE_PRODUCT: Product = {
  id: 1,
  title: 'دریل بتن‌کن رونیکس 2701',
  brand: 'رونیکس',
  price: 5120000,
  oldPrice: 6400000,
  rating: 4.9,
  reviews: 212,
  image: '/images/tool2.jpg',
  badge: 'پرفروش',
  cat: 'دریل',
}

function Harness() {
  const [product, setProduct] = useState<Product | null>(null)
  return (
    <ToastProvider>
      <button type="button" onClick={() => setProduct(SAMPLE_PRODUCT)}>
        باز کردن جزئیات
      </button>
      <ProductModal product={product} onClose={() => setProduct(null)} />
    </ToastProvider>
  )
}

describe('ProductModal', () => {
  it('renders a modal dialog with reported semantics, labelled and ALT image', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن جزئیات' }))

    const dialog = await screen.findByRole('dialog', { name: /دریل بتن‌کن رونیکس 2701/ })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('img', { name: SAMPLE_PRODUCT.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: `${SAMPLE_PRODUCT.rating} از ۵ ستاره` })).toBeInTheDocument()
  })

  it('moves focus into the dialog and restores it on close', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'باز کردن جزئیات' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('button', { name: 'بستن' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن جزئیات' }))
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('adds a toast and closes when the primary CTA is used', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن جزئیات' }))
    await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: 'افزودن به سبد خرید' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('status')).toHaveTextContent('به سبد افزوده شد')
  })
})