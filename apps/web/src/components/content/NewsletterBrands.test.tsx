import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NewsletterBrands } from './NewsletterBrands'
import { CatalogProvider } from '../../state/CatalogProvider'
import { CatalogFixtureClient } from '../../services/catalog/fixtures'

function renderNewsletter() {
  return render(
    <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
      <NewsletterBrands />
    </CatalogProvider>,
  )
}

describe('NewsletterBrands', () => {
  it('shows the newsletter teaser and a live brand list without a subscribe form', async () => {
    renderNewsletter()

    expect(screen.getByRole('heading', { name: 'عضو خبرنامه شوید' })).toBeInTheDocument()
    expect(screen.getByText('به‌زودی')).toBeInTheDocument()

    expect(await screen.findByRole('list', { name: 'برندهای موجود' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'دریافت کد' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('شماره موبایل یا ایمیل')).not.toBeInTheDocument()
  })

  it('renders only brands that exist in the live catalog list', async () => {
    renderNewsletter()

    const ronix = await screen.findByText('Ronix')
    expect(ronix).toHaveAttribute('role', 'listitem')

    expect(screen.getByText('Bosch')).toBeInTheDocument()
    expect(screen.queryByText('فیک‌برند')).not.toBeInTheDocument()
  })
})