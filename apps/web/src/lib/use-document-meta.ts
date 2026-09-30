import { useEffect } from 'react'
import { SITE_NAME } from './site-config'

/**
 * Per-route document metadata for the storefront.
 *
 * PRODUCT_SPEC §5 ("Customer web") requires canonical URLs, metadata and
 * product structured data. Titles, descriptions and the robots directive are
 * driven by the route that is actually rendered, so a private or transactional
 * screen (cart, checkout, account, orders, payment) is never indexable while
 * discovery screens stay indexable.
 */

const MAX_DESCRIPTION_CHARS = 160

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

export type DocumentMeta = {
  title: string
  description?: string | null
  /** Absolute or root-relative canonical path for this screen. */
  canonicalPath?: string
  /** Private/transactional screens must not be indexed. */
  noindex?: boolean
  /** Root-relative or absolute share image for link previews. */
  shareImage?: string | null
}

export function useDocumentMeta({ title, description, canonicalPath, noindex = false, shareImage }: DocumentMeta): void {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
    const summary = (description ?? '').slice(0, MAX_DESCRIPTION_CHARS)
    document.title = fullTitle
    upsertMeta('meta[name="description"]', 'name', 'description', summary)
    upsertMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, follow' : 'index, follow')
    const canonical = canonicalPath ? `${window.location.origin}${canonicalPath}` : null
    if (canonical) {
      upsertLink('canonical', canonical)
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove()
    }

    // Social/IM previews have no fallback for a missing tag, so every share
    // field is written explicitly rather than left to the consumer's defaults.
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website')
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME)
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle)
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', summary)
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', 'fa_IR')
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical ?? window.location.href)
    if (shareImage) {
      const absolute = shareImage.startsWith('http') ? shareImage : `${window.location.origin}${shareImage}`
      upsertMeta('meta[property="og:image"]', 'property', 'og:image', absolute)
      upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image')
      upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle)
      upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', summary)
      upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', absolute)
    } else {
      for (const selector of [
        'meta[property="og:image"]',
        'meta[name="twitter:card"]',
        'meta[name="twitter:title"]',
        'meta[name="twitter:description"]',
        'meta[name="twitter:image"]',
      ]) {
        document.head.querySelector(selector)?.remove()
      }
    }
  }, [title, description, canonicalPath, noindex, shareImage])
}
