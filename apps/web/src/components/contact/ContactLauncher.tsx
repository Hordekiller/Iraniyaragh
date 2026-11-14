'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { Instagram, MessageCircle, Phone, Send, X } from 'lucide-react'
import type { ContactChannel, StorefrontContactLink, StorefrontContactsPublic } from '@iranyaragh/contracts'
import { jsonRequest } from '../../lib/auth/request'
import { getHelperOpen, getServerHelperOpen, subscribeHelper } from '../../lib/help-tour-state'
import { useHelperEnabled } from '../../lib/use-helper-enabled'

const icons = { instagram: Instagram, whatsapp: MessageCircle, bale: Send, phone: Phone, other: MessageCircle } as const
const colors: Record<ContactChannel, string> = {
  instagram: 'contact-link-instagram', whatsapp: 'contact-link-whatsapp', bale: 'contact-link-bale', phone: 'contact-link-phone', other: 'contact-link-other',
}

function contactHref(link: StorefrontContactLink) {
  if (link.channel === 'phone') return /^\+?[0-9]{7,15}$/.test(link.value) ? `tel:${link.value}` : null
  try { const url = new URL(link.value); return url.protocol === 'https:' ? url.href : null } catch { return null }
}

export function ContactLauncher() {
  const [links, setLinks] = useState<StorefrontContactLink[]>([])
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  const helperOpen = useSyncExternalStore(subscribeHelper, getHelperOpen, getServerHelperOpen)
  const helperEnabled = useHelperEnabled()

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void jsonRequest<StorefrontContactsPublic>('/api/v1/catalog/storefront-contacts')
        .then(response => { if (alive && Array.isArray(response.data.links)) setLinks(response.data.links) })
        .catch(() => { /* leave the last known safe configuration visible */ })
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const published = links.filter(link => contactHref(link) !== null)
  if (!published.length || (helperEnabled && helperOpen)) return null

  return <div ref={root} className={`contact-launcher ${/^\/products?\//u.test(pathname) ? 'contact-launcher-product' : ''}`}>
    <nav id="contact-launcher-menu" aria-label="راه‌های ارتباط با فروشگاه" aria-hidden={!open} className={`contact-popover ${open ? 'contact-popover-open' : ''}`}>
      <div className="contact-popover-heading"><span>ارتباط با ایرانی یراق</span><button type="button" aria-label="بستن راه‌های ارتباط" tabIndex={open ? 0 : -1} onClick={() => { setOpen(false); button.current?.focus() }}><X size={18} aria-hidden="true" /></button></div>
      <div className="contact-popover-list">
        {published.map(link => {
          const Icon = icons[link.channel]
          const href = contactHref(link)!
          return <a key={link.id} href={href} target={link.channel === 'phone' ? undefined : '_blank'} rel={link.channel === 'phone' ? undefined : 'noopener noreferrer'} tabIndex={open ? 0 : -1} className={`contact-popover-link ${colors[link.channel]}`}>
            <span className="contact-popover-icon"><Icon size={19} aria-hidden="true" /></span><span>{link.label}</span>
          </a>
        })}
      </div>
    </nav>
    <button ref={button} type="button" className="contact-launcher-button" aria-label="راه‌های ارتباط با فروشگاه" aria-controls="contact-launcher-menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <MessageCircle size={21} aria-hidden="true" /><span>ارتباط با ما</span>
    </button>
  </div>
}
