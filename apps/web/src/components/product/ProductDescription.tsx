/**
 * Full catalog description block.
 *
 * The public product contract exposes a single `description` field, so this is
 * the only description surface the storefront can render truthfully. Nothing is
 * appended or summarized here; the lead sentence is derived from the same text
 * by `descriptionLead` in `lib/product.ts`.
 */
export function ProductDescription({ description }: { description: string | null }) {
  if (!description?.trim()) return null

  return (
    <section aria-labelledby="product-description" className="rounded-3xl border border-slate-100 bg-white p-5 lg:p-6">
      <h2 id="product-description" className="font-black text-slate-900 text-base">
        توضیحات محصول
      </h2>
      <div className="mt-3 text-[13px] leading-8 text-slate-600 whitespace-pre-line">
        {description.trim()}
      </div>
    </section>
  )
}
