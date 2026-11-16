import { Link } from 'react-router-dom'
import { LegalDocument } from '../components/legal/LegalDocument'
import { ROUTES } from '../lib/routes'
import { STORE_PAGES } from '../lib/store-pages'
import { INSTAGRAM_URL } from '../lib/site-config'

export function ContactPage() {
  return <LegalDocument title={STORE_PAGES.contact.title} intro={STORE_PAGES.contact.description}>
    <section><h2>راهنمای خرید و انتخاب کالا</h2><p>برای مشاهدهٔ روش انتخاب کالا، انتخاب تنوع و مراحل ثبت سفارش، به <Link className="underline" to={ROUTES.help}>مرکز راهنمای مشتری</Link> مراجعه کنید. مشخصات، قیمت و وضعیت موجودی هر کالا در صفحهٔ محصول نمایش داده می‌شود.</p></section>
    <section><h2>پیگیری سفارش</h2><p>پس از ورود با شمارهٔ موبایل ثبت سفارش، جزئیات و وضعیت سفارش‌های خود را در <Link className="underline" to={ROUTES.orders}>سفارش‌های من</Link> ببینید. هنگام تماس دربارهٔ یک سفارش، شمارهٔ سفارش را آماده داشته باشید؛ کد ورود پیامکی را در اختیار دیگران قرار ندهید.</p></section>
    <section><h2>ارتباط با فروشنده</h2><p>راه‌های تماس و نشانی اعلام‌شدهٔ فروشگاه در بخش اطلاعات فروشنده در همین صفحه درج می‌شود. برای هماهنگی مراجعهٔ حضوری از راه‌های تماس اعلام‌شده استفاده کنید.</p>{INSTAGRAM_URL && <p><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="underline">صفحهٔ اینستاگرام ایرانی یراق</a></p>}</section>
  </LegalDocument>
}

export function AboutPage() {
  return <LegalDocument title={STORE_PAGES.about.title} intro={STORE_PAGES.about.description}>
    <section><h2>یراق‌آلات کابینت و ابزار</h2><p>در <Link className="underline" to={ROUTES.categories}>دسته‌بندی کالاها</Link> می‌توانید محصولات منتشرشده را پیدا کنید و مشخصات، تصاویر و تنوع‌های قابل انتخاب را در صفحهٔ هر کالا ببینید. قیمت و موجودی بر اساس تنوع انتخاب‌شده نمایش داده می‌شود و هنگام ثبت سفارش دوباره بررسی می‌شود.</p></section>
    <section><h2>سفارش ساخت درب</h2><p>در بخش <Link className="underline" to={ROUTES.customDoors}>سفارش درب سفارشی</Link> امکان انتخاب مدل، متریال و ابعاد دلخواه فراهم است. مشخصات و مبلغ نهایی پیش از پرداخت تأیید می‌شوند.</p></section>
    <section><h2>اطلاعات پیش از خرید</h2><p><Link className="underline" to={ROUTES.terms}>قوانین و شرایط فروش</Link> و <Link className="underline" to={ROUTES.privacy}>حریم خصوصی</Link> را پیش از ثبت سفارش مطالعه کنید. برای راهنمایی از <Link className="underline" to={ROUTES.contact}>صفحهٔ تماس و پشتیبانی</Link> استفاده کنید.</p></section>
  </LegalDocument>
}
