import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../index.css'
import { Storefront } from '../components/next/Storefront'

export const metadata: Metadata = { icons: { icon: [{ url: '/brand/favicon.ico', sizes: 'any', type: 'image/x-icon' }, { url: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/brand/apple-touch-icon.png?v=20261104', sizes: '180x180', type: 'image/png' }] } }

export const dynamic = 'force-dynamic'
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fa" dir="rtl"><body><Storefront>{children}</Storefront></body></html>
}
