import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { popularProducts } from '../data/prototype'
import { ToastProvider } from '../components/feedback/Toast'
import { HomePage } from './HomePage'

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <ToastProvider>
              <HomePage />
            </ToastProvider>
          }
        />
        <Route path="/product/:slug" element={<span data-testid="product-probe">product</span>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('renders the hero, category grid, popular tools and the newsletter section', () => {
    renderHome()

    expect(screen.getByRole('region', { name: 'اسلایدر پیشنهاد ویژه' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'دسته‌بندی تخصصی ابزار' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ابزار محبوب هفته' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'عضو باشگاه استادکاران شوید' })).toBeInTheDocument()
  })

  it('navigates to the product page when a popular tool is selected', () => {
    renderHome()

    const first = popularProducts[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.title) }))

    expect(screen.getByTestId('product-probe')).toBeInTheDocument()
  })
})