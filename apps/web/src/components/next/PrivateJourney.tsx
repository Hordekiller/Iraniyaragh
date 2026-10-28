
'use client'
import dynamic from 'next/dynamic'
const PrivateRoutes = dynamic(() => import('./PrivateRoutes'), { ssr: false, loading: () => <p role="status" className="p-8 text-center">در حال بارگذاری…</p> })
export function PrivateJourney() { return <PrivateRoutes /> }
