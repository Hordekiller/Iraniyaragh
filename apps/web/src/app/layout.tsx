import type { ReactNode } from 'react'
import '../index.css'
import { Storefront } from '../components/next/Storefront'

export const dynamic = 'force-dynamic'
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fa" dir="rtl"><body><Storefront>{children}</Storefront></body></html>
}
