import { HelpPage } from '../../views/HelpPage'
import { metadataFor, type SearchParams } from '../../server/policy'
import { JsonLd, breadcrumb, webpageJsonLd } from '../../server/structured-data'

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return metadataFor({
    title: 'مرکز راهنمای مشتری',
    description: 'راهنمای گام‌به‌گام ورود، خرید، پرداخت، پیگیری سفارش و سفارش ساخت درب در ایرانی یراق.',
    path: '/help', indexable: Object.keys(await searchParams).length === 0,
  })
}
export default function Page() { return <><JsonLd data={[webpageJsonLd({ title: 'مرکز راهنمای مشتری', description: 'راهنمای خرید و استفاده از خدمات ایرانی یراق', path: '/help', type: 'CollectionPage' }), breadcrumb([{ name: 'خانه', path: '/' }, { name: 'مرکز راهنمای مشتری', path: '/help' }])]} /><HelpPage /></> }
