import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, Home, LayoutGrid, LoaderCircle, Package, PackageSearch, Search, ShoppingBag, TrendingUp, UserRound, X } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { toPersianDigits } from '../../lib/format'
import type { CatalogCategory } from '../../services/catalog/types'
import { useCatalogApi } from '../../state/catalog-context'
import { StoreBrandLogo } from '../brand/StoreBrandLogo'

const pageLinks = [
  { to: ROUTES.home, label: 'صفحه اصلی', detail: 'ویترین فروشگاه', icon: Home },
  { to: ROUTES.search, label: 'همه کالاها', detail: 'جستجو و انتخاب', icon: Search },
  { to: ROUTES.bestsellers, label: 'پرفروش‌ها', detail: 'انتخاب خریداران', icon: TrendingUp },
  { to: ROUTES.orders, label: 'سفارش‌های من', detail: 'مشاهده و پیگیری', icon: PackageSearch },
  { to: ROUTES.cart, label: 'سبد خرید', detail: 'ادامه خرید شما', icon: ShoppingBag },
  { to: ROUTES.account, label: 'حساب کاربری', detail: 'اطلاعات و نشانی‌ها', icon: UserRound },
]

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('fa').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ')
}

function CategoryBranch({ category, childrenByParent, ancestors, onNavigate }: {
  category: CatalogCategory
  childrenByParent: Map<string, CatalogCategory[]>
  ancestors: Set<string>
  onNavigate: () => void
}) {
  if (ancestors.has(category.id)) return null
  const visited = new Set([...ancestors, category.id])
  const children = childrenByParent.get(category.id) ?? []
  return (
    <li>
      <Link to={ROUTES.category(category.slug)} onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px] leading-6 text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-800">
        <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-orange-700/60" />
        {category.name}
      </Link>
      {children.length > 0 && <ul className="mr-3 border-r border-slate-200 pr-2">
        {children.map(child => <CategoryBranch key={child.id} category={child} childrenByParent={childrenByParent} ancestors={visited} onNavigate={onNavigate} />)}
      </ul>}
    </li>
  )
}

export function SiteNavigationDrawer({ onClose }: { onClose: () => void }) {
  const api = useCatalogApi()
  const { pathname } = useLocation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [categories, setCategories] = useState<CatalogCategory[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.listCategories().then(items => {
      if (!cancelled) setCategories(items)
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => { cancelled = true }
  }, [api, attempt])

  const childrenByParent = useMemo(() => {
    const children = new Map<string, CatalogCategory[]>()
    for (const category of categories ?? []) {
      if (category.parentId !== null) {
        const siblings = children.get(category.parentId) ?? []
        siblings.push(category)
        children.set(category.parentId, siblings)
      }
    }
    return children
  }, [categories])

  const term = normalize(query)
  function matches(category: CatalogCategory, visited = new Set<string>()): boolean {
    if (visited.has(category.id)) return false
    if (normalize(category.name).includes(term)) return true
    const next = new Set([...visited, category.id])
    return (childrenByParent.get(category.id) ?? []).some(child => matches(child, next))
  }
  const roots = (categories ?? []).filter(category => category.parentId === null && matches(category))
  const selected = roots.find(category => category.id === selectedId) ?? roots[0]
  const children = selected ? (childrenByParent.get(selected.id) ?? []).filter(child => !term || normalize(selected.name).includes(term) || matches(child)) : []

  return createPortal(
    <dialog
      ref={dialogRef}
      id="store-navigation"
      aria-labelledby="store-navigation-title"
      className="store-navigation-dialog"
      onCancel={event => { event.preventDefault(); onClose() }}
      onClose={event => { if (!event.currentTarget.open) onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, select')).filter(control => control.getClientRects().length > 0)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
    >
      <div className="store-navigation-panel flex h-full w-full max-w-[960px] flex-col overflow-hidden bg-white text-slate-900 shadow-2xl" dir="rtl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50"><StoreBrandLogo variant="mark" /></span>
            <div>
              <h2 id="store-navigation-title" className="text-base font-black">منوی فروشگاه</h2>
              <p className="mt-1 text-xs text-slate-500">ایرانی یراق؛ همراهِ پروژه‌های شما</p>
            </div>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="بستن منوی فروشگاه" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="relative isolate overflow-hidden bg-slate-950 px-5 py-5 text-white sm:px-7 sm:py-6">
            <span aria-hidden="true" className="pointer-events-none absolute -left-12 -top-24 -z-10 h-64 w-64 rounded-full border-[36px] border-white/5" />
            <p className="flex items-center gap-2 text-[11px] font-bold text-orange-200"><span className="h-1.5 w-1.5 rounded-full bg-orange-400" aria-hidden="true" /> انتخاب راحت‌تر، از همین‌جا</p>
            <p className="mt-2 text-xl font-black sm:text-2xl">هر پروژه، ابزار خودش را می‌خواهد.</p>
            <p className="mt-2 text-xs leading-6 text-slate-300">دسته‌بندی مورد نظرتان را انتخاب کنید و به کالاها برسید.</p>
          </div>

          <section aria-labelledby="navigation-categories-title" className="px-5 pb-6 pt-6 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="navigation-categories-title" className="flex items-center gap-2 text-sm font-black"><LayoutGrid size={18} className="text-orange-700" aria-hidden="true" /> دسته‌بندی کالاها</h3>
              {categories !== null && <span className="text-[11px] text-slate-500">{toPersianDigits(categories.filter(category => category.parentId === null).length)} دسته اصلی</span>}
            </div>
            <div className="relative mt-4">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" aria-label="جستجو در دسته‌بندی‌ها" value={query} onChange={event => setQuery(event.target.value)} placeholder="دنبال چه دسته‌ای می‌گردید؟" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pr-11 pl-3 text-sm transition-colors placeholder:text-slate-500 focus:border-orange-700 focus:bg-white" />
            </div>

            {failed ? (
              <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                <p>دسته‌بندی‌ها دریافت نشدند. دوباره تلاش کنید.</p>
                <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1) }} className="mt-3 min-h-11 rounded-xl bg-red-800 px-4 font-bold text-white">تلاش دوباره</button>
              </div>
            ) : categories === null ? (
              <p role="status" className="mt-5 flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> در حال دریافت دسته‌بندی‌ها…</p>
            ) : roots.length === 0 ? (
              <p role="status" className="mt-4 rounded-2xl border border-dashed border-slate-200 p-6 text-sm leading-7 text-slate-500">{query ? 'دسته‌ای با این نام پیدا نشد. عبارت دیگری را امتحان کنید.' : 'هنوز دسته‌بندی منتشرشده‌ای وجود ندارد.'}</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 md:grid md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-l">
                  <label htmlFor="navigation-category-select" className="mb-2 block text-xs font-bold text-slate-600 md:hidden">انتخاب دسته اصلی</label>
                  <select id="navigation-category-select" value={selected.id} onChange={event => setSelectedId(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold md:hidden">
                    {roots.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  <div aria-label="دسته‌های اصلی" className="hidden max-h-[420px] space-y-1 overflow-y-auto p-1 md:block">
                    {roots.map((category, index) => <button key={category.id} type="button" aria-pressed={selected.id === category.id} aria-controls="navigation-category-content" onClick={() => setSelectedId(category.id)} className={`group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-[13px] font-bold transition-colors ${selected.id === category.id ? 'bg-white text-orange-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                      <span aria-hidden="true" className={`text-[10px] font-medium tabular-nums ${selected.id === category.id ? 'text-orange-700' : 'text-slate-500'}`}>{toPersianDigits(String(index + 1).padStart(2, '0'))}</span>
                      <span className="flex-1">{category.name}</span>
                      <ChevronLeft size={15} aria-hidden="true" className={selected.id === category.id ? 'text-orange-700' : 'text-slate-400'} />
                    </button>)}
                  </div>
                </div>
                <div id="navigation-category-content" className="min-w-0 p-4 sm:p-5" role="region" aria-label={`دسته ${selected.name}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500">کاوش در دسته‌بندی</p>
                      <h4 className="mt-1 text-lg font-black">{selected.name}</h4>
                    </div>
                    <Link to={ROUTES.category(selected.slug)} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-50 px-3 text-xs font-bold text-orange-800 transition-colors hover:bg-orange-100">مشاهده همه <ArrowLeft size={15} aria-hidden="true" /></Link>
                  </div>
                  {children.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {children.map(child => <div key={child.id} className="self-start rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <Link to={ROUTES.category(child.slug)} onClick={onClose} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 text-sm font-bold text-slate-900 hover:text-orange-800">{child.name}<ChevronLeft size={15} className="shrink-0 text-orange-700" aria-hidden="true" /></Link>
                      {(childrenByParent.get(child.id) ?? []).length > 0 && <ul className="mt-1 border-t border-slate-200/70 pt-1">
                        {(childrenByParent.get(child.id) ?? []).map(category => <CategoryBranch key={category.id} category={category} childrenByParent={childrenByParent} ancestors={new Set([selected.id, child.id])} onNavigate={onClose} />)}
                      </ul>}
                    </div>)}
                  </div> : <Link to={ROUTES.category(selected.slug)} onClick={onClose} className="group mt-4 flex min-h-36 items-center gap-4 rounded-2xl bg-slate-50 p-5 transition-colors hover:bg-orange-50">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-orange-700"><Package size={26} strokeWidth={1.5} aria-hidden="true" /></span>
                    <span><span className="block text-sm font-black">کالاهای {selected.name}</span><span className="mt-2 block text-xs leading-6 text-slate-500">مشاهده، مقایسه و انتخاب کالا</span></span>
                    <ArrowLeft size={18} className="mr-auto shrink-0 text-orange-700" aria-hidden="true" />
                  </Link>}
                </div>
              </div>
            )}
          </section>

          <nav aria-label="صفحه‌های فروشگاه" className="border-t border-slate-100 px-5 py-6 sm:px-7">
            <h3 className="text-sm font-black">دسترسی سریع</h3>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {pageLinks.map(({ to, label, detail, icon: Icon }) => <Link key={to} to={to} onClick={onClose} aria-current={pathname === to ? 'page' : undefined} className={`group flex items-center gap-3 rounded-2xl border p-3 transition-colors sm:p-4 ${pathname === to ? 'border-orange-200 bg-orange-50' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/60'}`}>
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-orange-800" />
                <span><span className="block text-xs font-bold sm:text-[13px]">{label}</span><span className="mt-1 block text-[10px] leading-5 text-slate-500 sm:text-[11px]">{detail}</span></span>
              </Link>)}
            </div>
          </nav>
        </div>

        <nav aria-label="راهنمای فروشگاه" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] text-slate-500 sm:px-7">
          <span className="font-bold text-slate-700">با خیال راحت انتخاب کنید.</span>
          <div className="flex items-center gap-4">
            <Link to={ROUTES.terms} onClick={onClose} className="inline-flex min-h-11 items-center hover:text-orange-800">شرایط خرید</Link>
            <Link to={ROUTES.privacy} onClick={onClose} className="inline-flex min-h-11 items-center hover:text-orange-800">حریم خصوصی</Link>
          </div>
        </nav>
      </div>
    </dialog>,
    document.body,
  )
}
