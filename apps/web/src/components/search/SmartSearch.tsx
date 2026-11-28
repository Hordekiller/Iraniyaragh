import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock3, LoaderCircle, Search, X } from 'lucide-react'
import { useCatalogApi } from '../../state/catalog-context'
import type { CatalogSuggestions } from '../../services/catalog/types'
import { ROUTES } from '../../lib/routes'
import { formatToman, toPersianDigits } from '../../lib/format'

const HISTORY_KEY = 'irani-search-history-v1'
const meaningful = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, '').length
function history(): string[] {
  try { const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); return Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string' && v.length <= 150).slice(0, 6) : [] } catch { return [] }
}
function remember(value: string) {
  if (/@|[0-9۰-۹٠-٩]{6,}/u.test(value)) return
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([value, ...history().filter(item => item !== value)].slice(0, 6))) } catch { /* Private browsing may disable storage. */ }
}
function normalized(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[يى]/gu, 'ی').replace(/ك/gu, 'ک').replace(/[آأإ]/gu, 'ا').replace(/[ًٌٍَُِّْٰـ]/gu, '')
}
/** React text nodes only: no user-controlled HTML or regular expressions. */
export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const tokens = normalized(query).split(/\s+/u).filter(Boolean)
  return <>{text.split(/(\s+)/u).map((part, index) => tokens.some(token => normalized(part).includes(token)) ? <mark key={index} className="rounded bg-orange-100 text-inherit">{part}</mark> : <span key={index}>{part}</span>)}</>
}

type Props = { inputId?: string; value: string; onChange: (value: string) => void; onCompositionChange?: (composing: boolean) => void; label?: string; autoFocus?: boolean; onNavigate?: () => void; large?: boolean }
export function SmartSearch({ inputId, value, onChange, onCompositionChange, label = 'جستجو در محصولات', autoFocus = false, onNavigate, large = false }: Props) {
  const api = useCatalogApi()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const [composition, setComposition] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [popular, setPopular] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState<{ query: string; data: CatalogSuggestions | null; error: boolean } | null>(null)
  const query = value.trim()
  const ready = meaningful(query) >= 2
  const current = response?.query === query ? response : null
  const loading = ready && !current
  const options = current?.data?.items ?? []

  useEffect(() => {
    if (!open || !ready || composition) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const request = api.suggest ? api.suggest(query, controller.signal) : api.listProducts({ search: query, perPage: 8, sortBy: 'relevance', signal: controller.signal }).then(result => ({ ...result, facets: { categories: [], brands: [] }, correctedQuery: null }))
      request.then(data => { if (!controller.signal.aborted) { setResponse({ query, data, error: false }); setActive(-1) } }).catch(() => { if (!controller.signal.aborted) setResponse({ query, data: null, error: true }) })
    }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  }, [api, query, open, ready, composition, attempt])

  useEffect(() => {
    if (!open || !api.popularSearches) return
    const controller = new AbortController()
    api.popularSearches(controller.signal).then(items => { if (!controller.signal.aborted) setPopular(items) }).catch(() => undefined)
    return () => controller.abort()
  }, [api, open])
  function clickProduct(productId: string) { void api.recordSearchClick?.(query, productId).catch(() => undefined); finish(query) }

  function resultsUrl(term: string) {
    const next = new URLSearchParams(params)
    next.set('q', term); next.delete('page')
    return `${ROUTES.search}?${next}`
  }
  function finish(term: string) { remember(term); setOpen(false); onNavigate?.() }
  function submit(term = query) {
    if (meaningful(term) < 2) return
    finish(term); void navigate(resultsUrl(term))
  }
  return <div className="relative w-full text-right text-slate-900" dir="rtl" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <form role="search" onSubmit={event => { event.preventDefault(); if (!composing.current) submit() }} className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search size={19} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input id={inputId} ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={active >= 0 && options[active] ? `${id}-option-${active}` : undefined}
          autoComplete="off" autoCorrect="off" spellCheck={false} autoFocus={autoFocus} type="text" inputMode="search" enterKeyHint="search" aria-label={label} value={value} maxLength={150}
          placeholder="نام، مدل یا کد کالا را بنویسید…"
          onFocus={() => { setRecent(history()); setOpen(true) }}
          onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1) }}
          onCompositionStart={() => { composing.current = true; setComposition(true); onCompositionChange?.(true) }}
          onCompositionEnd={event => { composing.current = false; setComposition(false); onChange(event.currentTarget.value); onCompositionChange?.(false) }}
          onKeyDown={event => {
            if (composing.current || event.nativeEvent.isComposing) return
            if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1) }
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, options.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, -1)) }
            if (event.key === 'Enter' && open && active >= 0 && options[active]) { event.preventDefault(); clickProduct(options[active].id); void navigate(ROUTES.product(options[active].slug)) }
          }}
          className={`w-full border border-slate-200 bg-white pr-12 pl-11 text-sm placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${large ? 'h-14 rounded-2xl' : 'h-11 rounded-full'}`} />
        {value && <button type="button" onClick={() => { onChange(''); setActive(-1); inputRef.current?.focus() }} aria-label="پاک کردن جستجو" className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><X size={17} /></button>}
      </div>
      {large && <button className="rounded-2xl bg-[#FF4D00] px-4 text-sm font-bold text-white hover:bg-orange-700" type="submit">جستجوی کالا</button>}
    </form>
    {open && <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[min(65dvh,640px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
      <div role="status" aria-live="polite" className="px-2 py-2 text-xs text-slate-500">
        {!ready ? 'حداقل دو حرف بنویسید؛ نتیجه‌ها همین‌جا نمایش داده می‌شوند.' : loading ? <span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> در حال جستجو…</span> : current?.error ? (typeof navigator !== 'undefined' && !navigator.onLine ? 'اتصال اینترنت برقرار نیست.' : 'جستجو انجام نشد. دوباره تلاش کنید.') : `${toPersianDigits(current?.data?.meta.total ?? 0)} کالا پیدا شد`}
      </div>
      {current?.error && <button type="button" className="min-h-11 px-2 text-sm font-bold text-orange-800" onClick={() => { setResponse(null); setAttempt(n => n + 1) }}>تلاش دوباره</button>}
      <div id={`${id}-results`} role="listbox" aria-label="پیشنهادهای کالا">
        {options.map((product, index) => <Link key={product.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index} to={ROUTES.product(product.slug)} onClick={() => clickProduct(product.id)} onMouseEnter={() => setActive(index)}
          className={`flex min-h-20 items-center gap-3 rounded-xl p-2 outline-orange-600 ${active === index ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
          <img src={product.image} alt="" width={56} height={56} className="size-14 shrink-0 rounded-lg border border-slate-100 object-contain" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-6"><SearchHighlight text={product.name} query={query} /></span><span className="mt-1 block text-xs text-slate-500">{product.stockStatus === 'IN_STOCK' || product.stockStatus === 'LOW_STOCK' ? 'موجود' : product.stockStatus === 'OUT_OF_STOCK' ? 'ناموجود' : 'موجودی هنگام انتخاب بررسی می‌شود'}</span></span>
          <span className="shrink-0 text-xs font-bold">{product.priceAvailable === false ? 'قیمت نامشخص' : formatToman(product.price.amount)}</span>
        </Link>)}
      </div>
      {!ready && recent.length > 0 && <div className="border-t border-slate-100 pt-2"><div className="flex items-center justify-between px-2 text-xs text-slate-500"><span>جستجوهای اخیر این مرورگر</span><button type="button" className="min-h-11 text-orange-800" onClick={() => { try { localStorage.removeItem(HISTORY_KEY) } catch { /* No storage available. */ } setRecent([]) }}>پاک کردن سابقه</button></div>{recent.map(term => <button key={term} type="button" onClick={() => { onChange(term); setOpen(true) }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50"><Clock3 size={15} />{term}</button>)}</div>}
      {!ready && popular.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-2 text-xs text-slate-500">جستجوهای پرطرفدار</p><div className="flex flex-wrap gap-2">{popular.map(term => <button key={term} type="button" className="min-h-11 rounded-full bg-orange-50 px-3 text-xs" onClick={() => onChange(term)}>{term}</button>)}</div></div>}
      {current?.data?.correctedQuery && <button type="button" className="min-h-11 px-2 text-sm text-orange-800" onClick={() => onChange(current.data!.correctedQuery!)}>پیشنهاد: {current.data.correctedQuery}</button>}
      {ready && !loading && !current?.error && options.length === 0 && <p className="px-2 py-4 text-sm leading-7 text-slate-600">کالایی پیدا نشد. نام کوتاه‌تر، مدل کالا یا دسته‌بندی آن را امتحان کنید.</p>}
      {current?.data?.facets.categories.length ? <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{current.data.facets.categories.slice(0, 3).map(category => <Link key={category.id} to={ROUTES.category(category.slug)} onClick={() => finish(query)} className="rounded-full bg-slate-100 px-3 py-2 text-xs">دستهٔ {category.name}</Link>)}</div> : null}
      {current?.data?.facets.brands.length ? <div className="mt-2 flex flex-wrap gap-2">{current.data.facets.brands.slice(0, 3).map(brand => <Link key={brand.id} to={`${resultsUrl(query)}&brand=${encodeURIComponent(brand.id)}`} onClick={() => finish(query)} className="rounded-full bg-orange-50 px-3 py-2 text-xs">برند {brand.name}</Link>)}</div> : null}
      {ready && <Link to={resultsUrl(query)} onClick={() => finish(query)} className="mt-3 flex min-h-11 items-center justify-between rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">همهٔ نتایج «{query}»<ArrowLeft size={18} /></Link>}
    </div>}
  </div>
}
