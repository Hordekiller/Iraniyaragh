'use client'
import { useEffect, useState } from 'react'
import { useCampaigns } from '../../state/use-campaigns'
export function ShopCampaigns({ title, limit }: { title: string; limit: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const campaigns = useCampaigns().filter(item =>
    (!item.startsAt || Date.parse(item.startsAt) <= now) &&
    (!item.endsAt || Date.parse(item.endsAt) > now),
  ).slice(0, limit)
  if (!campaigns.length) return null
  return <section className="mt-10"><h2 className="text-xl font-black">{title}</h2><p className="mt-2 text-sm text-slate-600">شرایط جشنواره و تخفیف نهایی در سبد خرید بررسی می‌شود.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{campaigns.map(item => <article key={item.id} className="rounded-2xl border border-orange-200 bg-orange-50 p-5"><h3 className="font-bold">{item.name}</h3>{item.badgeText && <p className="mt-2 text-sm">{item.badgeText}</p>}</article>)}</div></section>
}
