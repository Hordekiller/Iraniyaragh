import { useEffect } from 'react'
import { SITE_NAME } from './site-config'
import { ROUTES } from './routes'

const documents: Record<string, { title: string; description: string }> = {
  [ROUTES.categories]: { title: 'دسته‌بندی کالاها', description: 'دسته‌بندی‌های ابزار و یراق‌آلات ایرانی یراق؛ جستجو میان دسته‌ها و دسترسی به زیر‌دسته‌ها و کالاها.' },
  [ROUTES.privacy]: { title: 'حریم خصوصی', description: 'نحوهٔ استفاده از اطلاعات حساب، سبد خرید، نشانی و سفارش در ایرانی یراق.' },
  [ROUTES.terms]: { title: 'قوانین و شرایط فروش', description: 'اطلاعات خرید، پرداخت، ارسال و شرایط اعلام‌شدهٔ فروشنده در ایرانی یراق.' },
}

/** The shell owns metadata so private-route robots/canonical state cannot leak to the next route. */
export function useRouteMetadata(pathname: string, serverMetadata = false) {
  useEffect(() => {
    if (serverMetadata) return
    const info = documents[pathname]
    const privateRoute = /^\/(?:account|cart|checkout|orders|payment|payment-return)(?:\/|$)/u.test(pathname)
    document.title = info ? `${info.title} | ${SITE_NAME}` : SITE_NAME
    for (const [name, content] of [
      ['robots', privateRoute ? 'noindex, follow' : 'index, follow'],
      ['description', info?.description ?? 'کاتالوگ ابزار و یراق و خرید از ایرانی یراق.'],
    ]) {
      let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
      if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.append(meta) }
      meta.content = content
    }
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (info) {
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical) }
      canonical.href = `${window.location.origin}${pathname}`
    } else canonical?.remove()
  }, [pathname, serverMetadata])
}


function ensureMetaTag(name: string, attribute: 'name' | 'property' = 'name'): HTMLMetaElement {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute(attribute, name)
    document.head.append(meta)
  }
  return meta
}

function ensureLinkTag(rel: string): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    document.head.append(link)
  }
  return link
}

export type DynamicMetadata = {
  title?: string
  description?: string
  image?: string
  type?: 'website' | 'product' | 'article'
  noindex?: boolean
}

export function setDynamicMetadata(meta: DynamicMetadata) {
  const siteName = SITE_NAME
  const fullTitle = meta.title ? `${meta.title} | ${siteName}` : siteName
  document.title = fullTitle
  
  const desc = meta.description || 'کاتالوگ ابزار و یراق و خرید از ایرانی یراق.'
  ensureMetaTag('description').content = desc
  
  const robots = meta.noindex ? 'noindex, follow' : 'index, follow'
  ensureMetaTag('robots').content = robots
  
  // OpenGraph
  ensureMetaTag('og:title', 'property').content = meta.title || siteName
  ensureMetaTag('og:site_name', 'property').content = siteName
  ensureMetaTag('og:description', 'property').content = desc
  ensureMetaTag('og:type', 'property').content = meta.type || 'website'
  ensureMetaTag('og:url', 'property').content = window.location.href
  ensureMetaTag('og:locale', 'property').content = 'fa_IR'
  if (meta.image) {
    ensureMetaTag('og:image', 'property').content = meta.image
  } else {
    document.head.querySelector('meta[property="og:image"]')?.remove()
  }
  
  // Twitter Card
  ensureMetaTag('twitter:card').content = meta.image ? 'summary_large_image' : 'summary'
  ensureMetaTag('twitter:title').content = meta.title || siteName
  ensureMetaTag('twitter:description').content = desc
  if (meta.image) {
    ensureMetaTag('twitter:image').content = meta.image
  } else {
    document.head.querySelector('meta[name="twitter:image"]')?.remove()
  }
}

export function setCanonicalUrl(url: string) {
  const canonical = ensureLinkTag('canonical')
  canonical.href = url
}

export function removeCanonicalUrl() {
  document.head.querySelector('link[rel="canonical"]')?.remove()
}
