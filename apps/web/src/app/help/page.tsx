import { HelpPage } from '../../views/HelpPage'
import { metadataFor } from '../../server/policy'
import { JsonLd, breadcrumb } from '../../server/structured-data'

export function generateMetadata() {
  return metadataFor({
    title: 'مرکز راهنمای مشتری',
    description: 'راهنمای گام‌به‌گام ورود، خرید، پرداخت، پیگیری سفارش و سفارش ساخت درب در ایرانی یراق.',
    path: '/help',
  })
}
export default function Page() { return <><JsonLd data={breadcrumb([{ name: 'خانه', path: '/' }, { name: 'مرکز راهنمای مشتری', path: '/help' }])} /><HelpPage /></> }
