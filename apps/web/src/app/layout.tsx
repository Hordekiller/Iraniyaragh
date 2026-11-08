import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../index.css'
import { Storefront } from '../components/next/Storefront'
import { publicOrigin, STORE_NAME } from '../server/policy'
import { hasLiveBlog } from '../server/blog'

/** Relative asset URLs resolve against the configured canonical origin, never the request Host. */
function metadataBase(): URL | undefined {
  try { return new URL(publicOrigin()) } catch { return undefined }
}
const description = 'ایرانی یراق، فروشگاه تخصصی یراق‌آلات کابینت و ابزار؛ مشخصات کالا، قیمت و وضعیت موجودی، و سفارش ساخت درب با اندازهٔ دلخواه.'

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  // No title template: page metadata already carries the brand suffix.
  title: `${STORE_NAME} — فروشگاه تخصصی یراق‌آلات کابینت و ابزار`,
  description,
  applicationName: STORE_NAME,
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: { type: 'website', locale: 'fa_IR', siteName: STORE_NAME },
  icons: { icon: [{ url: '/brand/favicon.ico', sizes: 'any', type: 'image/x-icon' }, { url: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/brand/apple-touch-icon.png?v=20261104', sizes: '180x180', type: 'image/png' }] },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f172a' }

export const dynamic = 'force-dynamic'
export default async function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fa" dir="rtl"><body><Storefront hasBlog={await hasLiveBlog()}>{children}</Storefront></body></html>
}
