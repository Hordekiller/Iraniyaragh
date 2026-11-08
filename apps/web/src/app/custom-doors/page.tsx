import { PrivateJourney } from '../../components/next/PrivateJourney'
import { absolute, metadataFor } from '../../server/policy'
import { JsonLd, breadcrumb } from '../../server/structured-data'
import { ROUTES } from '../../lib/routes'

const title = 'سفارش آنلاین درب فریم‌لس و دکوفیکس'
const description = 'انتخاب مدل، متریال و ابعاد سفارشی؛ تأیید قیمت، پرداخت مبلغ نهایی و پیگیری ساخت در ایرانی یراق.'
export function generateMetadata() { return metadataFor({ title, description, path: ROUTES.customDoors }) }

/** Mirrors the copy shown by the interactive configurator; no price or lead time is stated. */
function Intro() {
  return <section className="mx-auto max-w-3xl px-4 py-12" aria-labelledby="custom-door-intro-title">
    <h1 id="custom-door-intro-title" className="text-2xl font-black leading-relaxed md:text-3xl">{title}</h1>
    <p className="mt-4 text-sm leading-8">مدل و متریال ثبت‌شده را انتخاب کنید، ابعاد دلخواه را وارد کنید و چند درب را در یک سفارش بسازید. مشخصات و قیمت، پیش از پرداخت مبلغ نهایی تأیید می‌شوند.</p>
    <p role="status" className="mt-6 text-sm">در حال بارگذاری فرم سفارش…</p>
  </section>
}
export default function Page() {
  return <>
    <JsonLd data={[breadcrumb([{ name: 'خانه', path: '/' }, { name: title, path: ROUTES.customDoors }]), { '@context': 'https://schema.org', '@type': 'WebPage', '@id': absolute(`${ROUTES.customDoors}#webpage`), url: absolute(ROUTES.customDoors), name: title, description, inLanguage: 'fa-IR', isPartOf: { '@id': absolute('/#website') } }]} />
    <PrivateJourney intro={<Intro />} />
  </>
}
