'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, LayoutGrid, LoaderCircle, Search, X } from 'lucide-react'
import { ROUTES } from '../lib/routes'
import { toPersianDigits } from '../lib/format'
import { useCatalogApi } from '../state/catalog-context'
import type { CatalogCategory } from '../services/catalog/types'

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('fa').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ')
}

export function CategoriesPage({ initialCategories }: { initialCategories?: CatalogCategory[] } = {}) {
  const api = useCatalogApi()
  const [categories, setCategories] = useState<CatalogCategory[] | null>(initialCategories ?? null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (initialCategories && attempt === 0) return
    let cancelled = false
    api.listCategories().then(items => {
      if (!cancelled) setCategories(items)
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => { cancelled = true }
  }, [api, attempt, initialCategories])

  const { byId, childrenByParent } = useMemo(() => {
    const byId = new Map<string, CatalogCategory>()
    const childrenByParent = new Map<string, CatalogCategory[]>()
    for (const category of categories ?? []) {
      byId.set(category.id, category)
      if (category.parentId !== null) {
        const children = childrenByParent.get(category.parentId) ?? []
        children.push(category)
        childrenByParent.set(category.parentId, children)
      }
    }
    return { byId, childrenByParent }
  }, [categories])

  const term = normalize(query)
  const visible = (categories ?? []).filter(category => term ? normalize(category.name).includes(term) : category.parentId === null)

  function parentPath(category: CatalogCategory) {
    const names: string[] = []
    const visited = new Set([category.id])
    let parentId = category.parentId
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) break
      names.unshift(parent.name)
      parentId = parent.parentId
    }
    return names.join(' / ')
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6 lg:py-8">
      <nav aria-label="مسیر صفحه" className="mb-4 flex items-center gap-2 text-xs text-slate-500">
        <Link to={ROUTES.home} className="inline-flex min-h-11 items-center hover:text-orange-800">خانه</Link>
        <ChevronLeft size={14} aria-hidden="true" />
        <span aria-current="page" className="font-bold text-slate-700">دسته‌بندی کالاها</span>
      </nav>

      <section aria-labelledby="categories-page-title" className="relative isolate overflow-hidden rounded-3xl bg-slate-950 p-5 text-white sm:p-8">
        <span aria-hidden="true" className="pointer-events-none absolute -left-14 -top-20 -z-10 h-64 w-64 rounded-full border-[36px] border-white/5" />
        <p className="flex items-center gap-2 text-xs font-bold text-orange-200"><LayoutGrid size={17} aria-hidden="true" /> راهنمای انتخاب ابزار و یراق</p>
        <h1 id="categories-page-title" className="mt-3 text-2xl font-black sm:text-3xl">دسته‌بندی کالاها</h1>
        <p className="mt-3 max-w-lg text-sm leading-7 text-slate-300">از دستهٔ مورد نظرتان شروع کنید؛ ابزار و یراق مناسب را راحت‌تر پیدا کنید.</p>
        <div className="relative mt-5 max-w-xl">
          <Search size={19} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="جستجو در دسته‌بندی کالاها" placeholder="نام دسته یا زیر‌دسته را بنویسید…" className="h-12 w-full rounded-2xl border border-white/20 bg-white pr-12 pl-12 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-orange-400" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="پاک کردن جستجوی دسته‌ها" className="absolute left-1 top-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"><X size={17} aria-hidden="true" /></button>}
        </div>
      </section>

      <section aria-labelledby="categories-results-title" className="mt-7 sm:mt-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="categories-results-title" className="text-base font-black text-slate-900 sm:text-lg">{term ? 'نتیجهٔ جستجوی دسته‌ها' : 'همه دسته‌بندی‌ها'}</h2>
          {categories && !failed && <p aria-live="polite" className="text-xs text-slate-500">{toPersianDigits(visible.length)} {term ? 'دسته پیدا شد' : 'دسته اصلی'}</p>}
        </div>

        {failed ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800">
          <p>دسته‌بندی‌ها دریافت نشدند. دوباره تلاش کنید.</p>
          <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1) }} className="mt-3 min-h-11 rounded-xl bg-red-800 px-4 font-bold text-white">تلاش دوباره</button>
        </div> : categories === null ? <p role="status" className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600"><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> در حال دریافت دسته‌بندی‌ها…</p> : visible.length === 0 ? <div role="status" className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm leading-7 text-slate-600">
          <p>{term ? 'دسته‌ای با این نام پیدا نشد. عبارت دیگری را امتحان کنید.' : 'هنوز دسته‌بندی منتشرشده‌ای وجود ندارد.'}</p>
          {term && <button type="button" onClick={() => setQuery('')} className="mt-3 min-h-11 rounded-xl bg-orange-50 px-4 font-bold text-orange-800 hover:bg-orange-100">نمایش همه دسته‌ها</button>}
        </div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(category => {
            const children = childrenByParent.get(category.id) ?? []
            const path = term ? parentPath(category) : ''
            return <article key={category.id} className="rounded-2xl border border-slate-200 bg-white p-4 transition-[border-color,box-shadow] hover:border-orange-200 hover:shadow-sm motion-reduce:transition-none sm:p-5">
              {path && <p className="mb-3 text-xs leading-6 text-slate-500">{path}</p>}
              <Link to={ROUTES.category(category.slug)} className="group flex min-h-14 items-center gap-3 rounded-xl">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-800"><LayoutGrid size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                <h3 className="flex-1 text-base font-black leading-7 text-slate-900 group-hover:text-orange-800">{category.name}</h3>
                <ArrowLeft size={18} aria-hidden="true" className="shrink-0 text-orange-700" />
              </Link>
              {children.length > 0 ? <ul className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                {children.slice(0, 4).map(child => <li key={child.id}><Link to={ROUTES.category(child.slug)} className="flex min-h-11 items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-800 motion-reduce:transition-none"><span className="flex-1">{child.name}</span><ChevronLeft size={13} aria-hidden="true" className="shrink-0" /></Link></li>)}
              </ul> : <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">کالاهای این دسته را ببینید و انتخاب کنید.</p>}
              {children.length > 4 && <Link to={ROUTES.category(category.slug)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-bold text-orange-800">همه زیر‌دسته‌های {category.name}<ArrowLeft size={14} aria-hidden="true" /></Link>}
            </article>
          })}
        </div>}
      </section>
    </div>
  )
}
