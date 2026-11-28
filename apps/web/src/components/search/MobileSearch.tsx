import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { SmartSearch } from './SmartSearch'

export function MobileSearch({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    dialog.showModal(); document.body.style.overflow = 'hidden'
    dialog.querySelector('input')?.focus({ preventScroll: true })
    return () => { dialog.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={dialogRef} id="mobile-header-search" aria-labelledby="mobile-search-title" onCancel={event => { event.preventDefault(); onClose() }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-white p-4 text-slate-900 backdrop:bg-slate-950/40" dir="rtl">
    <div className="mb-4 flex items-center justify-between"><h2 id="mobile-search-title" className="font-black">چه کالایی نیاز دارید؟</h2><button type="button" aria-label="بستن جستجو" onClick={onClose} className="flex size-11 items-center justify-center rounded-full bg-slate-100"><X size={20} /></button></div>
    <SmartSearch inputId="site-search-mobile" value={value} onChange={onChange} autoFocus onNavigate={onClose} />
  </dialog>, document.body)
}
