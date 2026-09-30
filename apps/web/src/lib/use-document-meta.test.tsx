import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDocumentMeta } from './use-document-meta'

function Probe(props: Parameters<typeof useDocumentMeta>[0]) {
  useDocumentMeta(props)
  return null
}

function metaContent(selector: string) {
  return document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute('content')
}

function canonicalHref() {
  return document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href')
}

describe('useDocumentMeta', () => {
  afterEach(() => {
    document.title = ''
    document.head.querySelector('meta[name="description"]')?.remove()
    document.head.querySelector('meta[name="robots"]')?.remove()
    document.head.querySelector('link[rel="canonical"]')?.remove()
  })

  it('suffixes the site name only when the title does not already carry it', () => {
    render(<Probe title="تازه‌ترین کالاها" canonicalPath="/newest" />)
    expect(document.title).toBe('تازه‌ترین کالاها | ایران یراق')

    render(<Probe title="ایران یراق" />)
    expect(document.title).toBe('ایران یراق')
  })

  it('marks transactional screens as noindex and discovery screens as indexable', () => {
    const { rerender } = render(<Probe title="سبد خرید" noindex />)
    expect(metaContent('meta[name="robots"]')).toBe('noindex, follow')

    rerender(<Probe title="تازه‌ترین کالاها" />)
    expect(metaContent('meta[name="robots"]')).toBe('index, follow')
  })

  it('writes the canonical URL for the rendered route and clears it otherwise', () => {
    const { rerender } = render(<Probe title="تازه‌ترین کالاها" canonicalPath="/newest" />)
    expect(canonicalHref()).toBe(`${window.location.origin}/newest`)

    rerender(<Probe title="سبد خرید" noindex />)
    expect(canonicalHref()).toBeUndefined()
  })

  it('truncates a long description to the supported length', () => {
    render(<Probe title="جست‌وجو" description={'ابزار '.repeat(80)} />)
    expect(metaContent('meta[name="description"]')?.length).toBe(160)
  })
})
