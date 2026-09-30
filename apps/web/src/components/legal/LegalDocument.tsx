import type { ReactNode } from 'react'
import { toPersianDigits } from '../../lib/format'
import { SITE_ADDRESS, SITE_NAME, SITE_PHONE, SITE_POSTAL_CODE } from '../../lib/site-config'

/**
 * Shared layout for the storefront's legal documents.
 *
 * Article 33 of Iran's Electronic Commerce Law requires the supplier's identity,
 * postal address and a way to reach them to be available to the customer before
 * the contract is made, so the contact block is rendered on every document
 * rather than being repeated per page.
 */

export function SupplierContactCard() {
  return (
    <section
      aria-labelledby="supplier-contact-heading"
      className="rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:p-6"
    >
      <h2 id="supplier-contact-heading" className="font-black text-slate-900 text-base">
        اطلاعات فروشنده
      </h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">نام تجاری</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{SITE_NAME}</dd>
        </div>
        <div>
          <dt className="text-slate-500">شماره تماس</dt>
          <dd className="mt-0.5 font-bold text-slate-900">
            <a
              href={`tel:${SITE_PHONE}`}
              className="underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
            >
              {toPersianDigits(SITE_PHONE)}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">نشانی</dt>
          <dd className="mt-0.5 font-bold text-slate-900">
            {SITE_ADDRESS.province}، {SITE_ADDRESS.city}، {SITE_ADDRESS.street}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">کد پستی</dt>
          <dd className="mt-0.5 font-bold text-slate-900" dir="ltr">
            {toPersianDigits(SITE_POSTAL_CODE)}
          </dd>
        </div>
      </dl>
    </section>
  )
}

/**
 * Placeholder for policy text the shop has not supplied yet.
 *
 * Marking these explicitly keeps the document honest: the storefront never
 * invents a cancellation window, return policy or offer-validity period.
 */
export function PendingPolicyNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-7 text-amber-900">
      <span className="font-black">در انتظار اعلام فروشنده: </span>
      {children}
    </p>
  )
}

type LegalDocumentProps = {
  title: string
  intro: string
  lastReviewed: string
  children: ReactNode
}

export function LegalDocument({ title, intro, lastReviewed, children }: LegalDocumentProps) {
  return (
    <article className="max-w-[860px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
      <header>
        <h1 className="font-black text-slate-900 text-xl lg:text-2xl">{title}</h1>
        <p className="mt-3 text-slate-600 text-sm leading-7">{intro}</p>
        <p className="mt-2 text-slate-400 text-xs">آخرین بازبینی: {lastReviewed}</p>
      </header>

      <div className="mt-8 grid gap-8 [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:text-base [&_h2]:mt-8 [&_p]:mt-2 [&_p]:text-slate-600 [&_p]:text-sm [&_p]:leading-7 [&_ul]:mt-2 [&_ul]:grid [&_ul]:gap-1 [&_ul]:text-slate-600 [&_ul]:text-sm [&_ul]:leading-7 [&_ul_li]:flex [&_ul_li]:gap-2">
        {children}
      </div>

      <div className="mt-10">
        <SupplierContactCard />
      </div>
    </article>
  )
}
