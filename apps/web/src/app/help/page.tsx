import { HelpPage } from '../../views/HelpPage'
import { metadataFor } from '../../server/policy'

export function generateMetadata() {
  return metadataFor({
    title: 'مرکز راهنمای مشتری',
    description: 'راهنمای گام‌به‌گام ورود، خرید، پرداخت، پیگیری سفارش و سفارش ساخت درب در ایرانی یراق.',
    path: '/help',
  })
}
export default function Page() { return <HelpPage /> }
