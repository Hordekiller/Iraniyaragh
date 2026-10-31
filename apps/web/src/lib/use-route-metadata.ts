import { useEffect } from 'react'
import { SITE_NAME } from './site-config'
import { ROUTES } from './routes'

const documents: Record<string, { title: string; description: string }> = {
  [ROUTES.categories]: { title: 'دسته‌بندی کالاها', description: 'دسته‌بندی ابزار و یراق‌آلات ایرانی یراق؛ جستجو میان دسته‌ها و زیر‌دسته‌ها.' },
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
