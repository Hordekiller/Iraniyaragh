import { notFound } from 'next/navigation'
import { PrivacyPage } from '../../../views/PrivacyPage'
import { TermsPage } from '../../../views/TermsPage'
import { metadataFor } from '../../../server/policy'

const policies = {
  privacy: { title: 'حریم خصوصی', description: 'نحوهٔ استفاده از اطلاعات حساب، سبد خرید، نشانی و سفارش در ایرانی یراق.' },
  terms: { title: 'قوانین و شرایط فروش', description: 'اطلاعات خرید، پرداخت، ارسال و شرایط اعلام‌شدهٔ فروشنده در ایرانی یراق.' },
}
function policy(slug: string) { if (slug !== 'privacy' && slug !== 'terms') notFound(); return policies[slug] }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Existing policy text declares pending business rules; no approval is invented.
  return metadataFor({ ...policy(slug), path: `/policies/${slug}`, indexable: false })
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  policy(slug)
  return <>{slug === 'privacy' ? <PrivacyPage /> : <TermsPage />}</>
}
