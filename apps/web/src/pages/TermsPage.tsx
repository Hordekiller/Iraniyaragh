import { LegalDocument, PendingPolicyNote } from '../components/legal/LegalDocument'
import { Link } from 'react-router-dom'
import { ROUTES } from '../lib/routes'

// Restored from storefront-completion, adapted to the current server-backed flow.
export function TermsPage() {
  return (
    <LegalDocument
      title="قوانین و شرایط فروش"
      intro="این صفحه شرایطی را که پیش از نهایی‌کردن سفارش باید بدانید خلاصه می‌کند. متن‌هایی که هنوز از سوی فروشنده اعلام نشده‌اند صریحاً مشخص شده‌اند و فروشگاه آن‌ها را از خود نمی‌سازد."
    >
      <section aria-labelledby="terms-identity">
        <h2 id="terms-identity">۱) مشخصات کالا</h2>
        <p>
          مشخصات فنی، کاربرد، قیمت و موجودی هر کالا در صفحهٔ همان کالا نمایش داده می‌شود. این
          اطلاعات از سامانهٔ فروشگاه خوانده می‌شود و قیمت و موجودی هنگام تکمیل سفارش دوباره بررسی می‌شوند.
        </p>
      </section>

      <section aria-labelledby="terms-order">
        <h2 id="terms-order">۲) ترتیب و نحوهٔ پرداخت</h2>
        <ul>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              در صورت فعال بودن درگاه، پرداخت پس از ثبت سفارش و از طریق درگاه بانکی آغاز می‌شود. مبلغ قابل پرداخت
              در صفحهٔ تسویه‌حساب و پیش از اتصال به درگاه به شما نمایش داده می‌شود.
            </span>
          </li>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              مبلغ نهایی از سمت سرور محاسبه و تأیید می‌شود؛ مبلغ ارسال‌شده از سمت شما ملاک نیست.
            </span>
          </li>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              ثبت سفارش به معنی پرداخت نیست. فقط تأیید پرداخت در سامانهٔ فروشگاه، ملاک پرداخت موفق است. اگر درگاه در دسترس نباشد، موفقیت پرداخت نمایش داده نمی‌شود. نتیجهٔ تراکنش در صفحهٔ پرداخت نمایش داده می‌شود و وضعیت سفارش از بخش «سفارش‌های من»
              پیگیری می‌شود.
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="terms-delivery">
        <h2 id="terms-delivery">۳) تحویل</h2>
        <ul>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              پیش از پرداخت، گزینه‌های ارسال موجود برای نشانی شما همراه با هزینهٔ هر گزینه نمایش
              داده می‌شود و می‌توانید یکی را انتخاب کنید.
            </span>
          </li>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              هزینهٔ ارسال به‌صورت جداگانه در صفحهٔ تسویه‌حساب نمایش داده می‌شود؛ اگر ارسال رایگان
              باشد، همان مقدار برگشتی از سامانه نمایش داده می‌شود.
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="terms-validity">
        <h2 id="terms-validity">۴) اعتبار قیمت و پیشنهاد</h2>
        <PendingPolicyNote>
          مدت زمانی که قیمت و موجودی اعلام‌شده در یک صفحه معتبر است، هنوز از سوی فروشنده اعلام نشده
          است. قیمت و موجودی در مرحلهٔ تکمیل سفارش دوباره بررسی می‌شوند؛ تغییر قیمت یا موجودی باید پیش از ادامهٔ خرید بررسی شود.
        </PendingPolicyNote>
      </section>

      <section aria-labelledby="terms-cancel-return">
        <h2 id="terms-cancel-return">۵) لغو سفارش، مرجوعی و خدمات پس از فروش</h2>
        <PendingPolicyNote>
          شرایط لغو سفارش پس از پرداخت، مهلت و شرایط مرجوعی کالا، و خدمات پس از فروش (ضمانت و
          پشتیبانی) هنوز از سوی فروشنده اعلام نشده است. برای خرید، ابتدا این شرایط و اطلاعات تماس تأییدشدهٔ فروشنده باید اعلام شوند.
        </PendingPolicyNote>
      </section>

      <section aria-labelledby="terms-privacy-link">
        <h2 id="terms-privacy-link">۶) حریم خصوصی</h2>
        <p>
          نحوهٔ نگهداری و استفاده از اطلاعات شخصی شما در صفحهٔ{' '}
          <Link
            to={ROUTES.privacy}
            className="font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
          >
            حریم خصوصی
          </Link>{' '}
          توضیح داده شده است.
        </p>
      </section>
    </LegalDocument>
  )
}
