import type { ReactNode } from 'react'
import { toPersianDigits } from '../../lib/format'
import { SITE_ADDRESS_LINE, SITE_EMAIL, SITE_NAME, SITE_PHONE, SITE_POSTAL_CODE } from '../../lib/site-config'

// Reuses the historical storefront legal layout, without its synthetic contact data.
export function SupplierContactCard() {
  const configured = SITE_PHONE !== null || SITE_EMAIL !== null || SITE_ADDRESS_LINE !== null || SITE_POSTAL_CODE !== null
  return <section aria-labelledby="supplier-contact-heading" className="rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:p-6">
    <h2 id="supplier-contact-heading" className="text-base font-black text-slate-900">اطلاعات فروشنده</h2>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-slate-500">نام تجاری</dt><dd className="mt-1 font-bold text-slate-900">{SITE_NAME}</dd></div>
      {SITE_PHONE !== null && <div><dt>شماره تماس</dt><dd><a href={`tel:${SITE_PHONE}`} className="font-bold underline" dir="ltr">{toPersianDigits(SITE_PHONE)}</a></dd></div>}
      {SITE_EMAIL !== null && <div><dt>ایمیل</dt><dd><a href={`mailto:${SITE_EMAIL}`} className="font-bold underline" dir="ltr">{SITE_EMAIL}</a></dd></div>}
      {SITE_ADDRESS_LINE !== null && <div><dt>نشانی</dt><dd>{SITE_ADDRESS_LINE}</dd></div>}
      {SITE_POSTAL_CODE !== null && <div><dt>کد پستی</dt><dd>{toPersianDigits(SITE_POSTAL_CODE)}</dd></div>}
    </dl>
    {!configured && <p className="mt-4 text-sm leading-7 text-slate-600">اطلاعات تماس تأییدشدهٔ فروشگاه هنوز منتشر نشده است.</p>}
  </section>
}

export function PendingPolicyNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"><strong>در انتظار اعلام فروشنده: </strong>{children}</p>
}

export function LegalDocument({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <article className="mx-auto max-w-[860px] px-4 py-12 lg:px-6 lg:py-16">
    <header><h1 className="text-xl font-black text-slate-900 lg:text-2xl">{title}</h1><p className="mt-3 text-sm leading-7 text-slate-600">{intro}</p></header>
    <div className="mt-8 grid gap-8 [&_h2]:text-base [&_h2]:font-black [&_h2]:text-slate-900 [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-7 [&_ul]:mt-2 [&_ul]:grid [&_ul]:gap-2 [&_ul]:text-sm [&_ul]:leading-7 [&_li]:flex [&_li]:gap-2">{children}</div>
    <div className="mt-10"><SupplierContactCard /></div>
  </article>
}
