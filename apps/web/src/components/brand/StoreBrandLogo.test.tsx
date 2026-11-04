import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StoreBrandLogo } from './StoreBrandLogo'

describe('approved brand identity', () => {
  it.each(['responsive', 'wordmark', 'inline'] as const)('keeps %s branding textual for assistive technology without duplicate visible copy', variant => {
    const view = render(<a href="/"><StoreBrandLogo variant={variant} /></a>)
    expect(screen.getByRole('link', { name: 'ایرانی یراق' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'ایرانی یراق' })).toHaveAttribute('src', '/brand/wordmark-432.webp?v=20261104')
    expect(view.container.textContent).toBe('')
  })
})
