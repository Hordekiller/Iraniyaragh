import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRouteMetadata } from './use-route-metadata'

describe('route metadata', () => {
  it('does not carry private page indexing state or identifiers onto public navigation', () => {
    const { rerender } = renderHook(({ path }) => useRouteMetadata(path), { initialProps: { path: '/orders/private-order-id' } })
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.title).not.toContain('private-order-id')
    rerender({ path: '/privacy' })
    expect(document.title).toContain('حریم خصوصی')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${window.location.origin}/privacy`)
    rerender({ path: '/' })
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.title).not.toContain('حریم خصوصی')
  })
})
