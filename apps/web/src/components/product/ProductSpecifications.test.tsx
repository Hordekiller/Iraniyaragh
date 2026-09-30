import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProductSpecifications } from './ProductSpecifications'

const VARIANT = {
  id: 'variant-1',
  sku: 'RON-2210',
  title: '۲۲۱۰ وات',
  salePrice: { amount: '28500000', currency: 'IRR' as const },
  available: true,
  lowStock: false,
  weightGrams: 2700,
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof ProductSpecifications>> = {}) {
  return render(
    <MemoryRouter>
      <ProductSpecifications
        brand="رونیکس"
        category={{ name: 'دریل', slug: 'drill' }}
        variant={VARIANT}
        variantCount={1}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('ProductSpecifications', () => {
  it('lists the values the catalog actually delivered', () => {
    renderPanel()

    expect(screen.getByText('برند')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'دریل' })).toHaveAttribute('href', '/category/drill')
    expect(screen.getByText('RON-2210')).toBeInTheDocument()
    // A single-variant product must not claim a variant count.
    expect(screen.queryByText('تعداد تنوع‌های فعال')).not.toBeInTheDocument()
  })

  it('counts the variants when the product has more than one', () => {
    renderPanel({ variantCount: 3 })

    expect(screen.getByText('تعداد تنوع‌های فعال')).toBeInTheDocument()
  })

  it('says so when there is genuinely nothing to show', () => {
    // A titled box with an empty <dl> reads as a loading bug, not as "no data".
    renderPanel({ brand: null, category: null, variant: null, variantCount: 0 })

    expect(screen.getByRole('heading', { name: 'مشخصات کالا' })).toBeInTheDocument()
    expect(screen.getByText('برای این کالا مشخصاتی ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByRole('definition')).not.toBeInTheDocument()
  })
})
