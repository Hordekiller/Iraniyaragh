'use client'

import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, MousePointerClick } from 'lucide-react'
import { SupplierContactCard } from '../components/legal/LegalDocument'
import { HELP_TOPICS, helpTopic, type HelpNoteKind, type HelpSection, type HelpTopic } from '../lib/help-content'
import { ROUTES } from '../lib/routes'
import { startTour } from '../lib/help-tour-state'
import { tourById } from '../lib/help-tours'
import { useHelperEnabled } from '../lib/use-helper-enabled'
import { NotFoundPage } from './NotFoundPage'

const noteStyle: Record<HelpNoteKind, { label: string; className: string }> = {
  tip: { label: 'نکته: ', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  warning: { label: 'توجه: ', className: 'border-red-200 bg-red-50 text-red-900' },
  pending: { label: 'در انتظار اعلام فروشنده: ', className: 'border-amber-200 bg-amber-50 text-amber-900' },
}

function Section({ section, id }: { section: HelpSection; id: string }) {
  const note = section.note ? noteStyle[section.note.kind] : null
  return <section aria-labelledby={id} className="rounded-3xl border border-slate-200 bg-white p-5 lg:p-6">
    <h2 id={id} className="text-base font-black text-slate-900">{section.heading}</h2>
    {section.paragraphs?.map(text => <p key={text} className="mt-3 text-sm leading-7 text-slate-700">{text}</p>)}
    {section.steps && <ol className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
      {section.steps.map((step, index) => <li key={step} className="flex gap-3">
        <span aria-hidden="true" className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-900">{(index + 1).toLocaleString('fa-IR')}</span>
        <span>{step}</span>
      </li>)}
    </ol>}
    {section.bullets && <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
      {section.bullets.map(text => <li key={text} className="flex gap-2"><span aria-hidden="true">•</span><span>{text}</span></li>)}
    </ul>}
    {section.note && note && <p className={`mt-4 rounded-2xl border p-4 text-sm leading-7 ${note.className}`}><strong>{note.label}</strong>{section.note.text}</p>}
  </section>
}

function Faq({ topic }: { topic: HelpTopic }) {
  if (!topic.faq?.length) return null
  return <section aria-labelledby={`${topic.slug}-faq`} className="rounded-3xl border border-slate-200 bg-white p-5 lg:p-6">
    <h2 id={`${topic.slug}-faq`} className="text-base font-black text-slate-900">پرسش‌های پرتکرار</h2>
    <div className="mt-3 divide-y divide-slate-100">
      {topic.faq.map(item => <details key={item.question} className="group py-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-slate-900">
          {item.question}<ChevronDown size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <p className="pb-3 text-sm leading-7 text-slate-700">{item.answer}</p>
      </details>)}
    </div>
  </section>
}

export function HelpPage() {
  return <article className="mx-auto max-w-[1000px] px-4 py-12 lg:px-6 lg:py-16">
    <header>
      <h1 className="text-xl font-black text-slate-900 lg:text-2xl">مرکز راهنمای مشتری</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        راهنمای گام‌به‌گام همهٔ مراحل خرید در ایرانی یراق: ورود، سبد، تکمیل سفارش، پرداخت، پیگیری و سفارش ساخت درب.
        این متن‌ها بر اساس رفتار واقعی همین فروشگاه نوشته شده‌اند؛ هرجا فروشنده هنوز شرطی را اعلام نکرده، همان صراحتاً ذکر می‌شود.
      </p>
    </header>
    <nav aria-label="مراحل خرید" className="mt-8">
      <h2 className="text-base font-black text-slate-900">موضوع‌های راهنما</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {HELP_TOPICS.map((topic, index) => <li key={topic.slug}>
          <Link to={ROUTES.helpTopic(topic.slug)} className="group flex h-full items-start gap-3 rounded-2xl border border-slate-200 p-4 transition-colors hover:border-orange-200 hover:bg-orange-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-900">{(index + 1).toLocaleString('fa-IR')}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900">{topic.title}</span><span className="mt-1 block text-xs leading-6 text-slate-600">{topic.summary}</span></span>
            <ArrowLeft size={16} aria-hidden="true" className="mt-1 shrink-0 text-orange-800" />
          </Link>
        </li>)}
      </ol>
    </nav>
    <div className="mt-10"><SupplierContactCard /></div>
  </article>
}

/** Next passes `slug` itself (no react-router <Route> exists there); the client router supplies it via the URL. */
export function HelpTopicPage({ slug: slugProp }: { slug?: string } = {}) {
  const params = useParams<{ slug: string }>()
  const slug = slugProp ?? params.slug ?? ''
  const navigate = useNavigate()
  const helperEnabled = useHelperEnabled()
  const topic = helpTopic(slug)
  if (!topic) return <NotFoundPage />
  const index = HELP_TOPICS.findIndex(item => item.slug === topic.slug)
  const tour = helperEnabled && topic.tour ? tourById(topic.tour) : undefined
  const related = topic.related.map(helpTopic).filter((item): item is HelpTopic => item !== undefined)
  return <article className="mx-auto max-w-[860px] px-4 py-12 lg:px-6 lg:py-16">
    <nav aria-label="مسیر صفحه" className="text-xs text-slate-500">
      <Link to={ROUTES.help} className="font-bold hover:text-orange-800">مرکز راهنمای مشتری</Link>
      <span aria-hidden="true"> / </span><span aria-current="page">{topic.title}</span>
    </nav>
    <header className="mt-4">
      <p className="text-xs font-bold text-orange-800">راهنمای {(index + 1).toLocaleString('fa-IR')} از {HELP_TOPICS.length.toLocaleString('fa-IR')}</p>
      <h1 className="mt-1 text-xl font-black text-slate-900 lg:text-2xl">{topic.title}</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">{topic.summary}</p>
      {tour && <div className="mt-4 rounded-3xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-sm font-black text-orange-950">راهنمای روی صفحه</p>
        <p className="mt-1 text-sm leading-7 text-orange-950">با یک راهنمای مرحله‌به‌مرحله، دکمه‌های واقعی فروشگاه را روی خود صفحه می‌بینید و محل هر دکمه هایلایت می‌شود. راهنما به‌جای شما کلیک یا ثبت نمی‌کند.</p>
        <button type="button" onClick={() => { startTour(tour.id); navigate(tour.start) }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-700 px-5 text-sm font-black text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"><MousePointerClick size={16} aria-hidden="true" />نمایش روی صفحه: {tour.title}</button>
      </div>}
      <Link to={topic.action.to} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-bold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]">
        {topic.action.label}<ArrowLeft size={16} aria-hidden="true" />
      </Link>
    </header>
    <div className="mt-8 grid gap-5">
      {topic.sections.map((section, i) => <Section key={section.heading} section={section} id={`${topic.slug}-s${i}`} />)}
      <Faq topic={topic} />
    </div>
    {related.length > 0 && <nav aria-label="راهنماهای مرتبط" className="mt-8">
      <h2 className="text-base font-black text-slate-900">راهنماهای مرتبط</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {related.map(item => <li key={item.slug}><Link to={ROUTES.helpTopic(item.slug)} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 px-4 text-sm font-bold hover:border-orange-200 hover:bg-orange-50">{item.title}</Link></li>)}
      </ul>
    </nav>}
    <div className="mt-10"><SupplierContactCard /></div>
  </article>
}
