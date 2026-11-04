import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HomeBanners } from './HomeBanners'

const banner = (id: string, href: string, mobile = false) => ({
  id, title: `بنر ${id}`, subtitle: 'زیرعنوان', ctaLabel: 'مشاهده', href, imageAlt: `تصویر ${id}`,
  desktopImage: { url: `https://cdn.test/${id}-d.webp`, width: 1200, height: 600 },
  mobileImage: mobile ? { url: `https://cdn.test/${id}-m.webp`, width: 600, height: 400 } : null,
})

describe('HomeBanners', () => {
  it('renders nothing when no banner is live', () => {
    const { container } = render(<MemoryRouter><HomeBanners banners={[]} /></MemoryRouter>)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders admin banners with internal and external links and a mobile source', () => {
    const { container } = render(<MemoryRouter><HomeBanners banners={[banner('a', '/categories/hinges', true), banner('b', 'https://example.com/x')]} /></MemoryRouter>)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /بنر a/ })).toHaveAttribute('href', '/categories/hinges')
    expect(screen.getByRole('link', { name: /بنر b/ })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container.querySelector('source')).toHaveAttribute('srcset', 'https://cdn.test/a-m.webp')
    expect(screen.getByAltText('تصویر a')).toHaveAttribute('width', '1200')
  })
  it('shows a status skeleton while loading', () => {
    render(<MemoryRouter><HomeBanners banners={[]} loading /></MemoryRouter>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
