import { LegalDocument, PendingPolicyNote } from '../components/legal/LegalDocument'
import { useDocumentMeta } from '../lib/use-document-meta'
import { ROUTES } from '../lib/routes'
import { SITE_NAME } from '../lib/site-config'

/**
 * Storefront terms of sale.
 *
 * Article 33 of Iran's Electronic Commerce Law requires the seller to disclose
 * the information a customer needs *before* the contract is made. This page
 * therefore states only what the live API and the shop owner can back, and
 * marks the remaining policy text as pending rather than inventing a
 * cancellation window, return policy or offer-validity period.
 */
export function TermsPage() {
  useDocumentMeta({
    title: 'قوانین و شرایط فروش',
    description: `شرایط فروش، ترتیب پرداخت و تحویل سفارش در ${SITE_NAME}.`,
    canonicalPath: ROUTES.terms,
  })

  return (
    <LegalDocument
      title="قوانین و شرایط فروش"
      intro="این صفحه شرایطی را که پیش از نهایی‌کردن سفارش باید بدانید خلاصه می‌کند. متن‌هایی که هنوز از سوی فروشنده اعلام نشده‌اند صریحاً مشخص شده‌اند و فروشگاه آن‌ها را از خود نمی‌سازد."
      lastReviewed="۱۴۰۵/۰۷/۰۷"
    >
      <section aria-labelledby="terms-identity">
        <h2 id="terms-identity">۱) مشخصات کالا</h2>
        <p>
          مشخصات فنی، کاربرد، قیمت و موجودی هر کالا در صفحهٔ همان کالا نمایش داده می‌شود. این
          اطلاعات مستقیماً از سامانهٔ فروشگاه خوانده می‌شود؛ اگر کالایی ناموجود باشد امکان افزودن آن به
          سبد خرید وجود ندارد.
        </p>
      </section>

      <section aria-labelledby="terms-order">
        <h2 id="terms-order">۲) ترتیب و نحوهٔ پرداخت</h2>
        <ul>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              پرداخت تنها پس از تأیید نهایی سفارش و از طریق درگاه بانکی انجام می‌شود. مبلغ قابل پرداخت
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
              نتیجهٔ تراکنش در صفحهٔ پرداخت نمایش داده می‌شود و وضعیت سفارش از بخش «سفارش‌های من»
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
          است. در این فاصله، قیمت و موجودی نمایش‌داده‌شده در لحظهٔ ثبت سفارش ملاک است.
        </PendingPolicyNote>
      </section>

      <section aria-labelledby="terms-cancel-return">
        <h2 id="terms-cancel-return">۵) لغو سفارش، مرجوعی و خدمات پس از فروش</h2>
        <PendingPolicyNote>
          شرایط لغو سفارش پس از پرداخت، مهلت و شرایط مرجوعی کالا، و خدمات پس از فروش (ضمانت و
          پشتیبانی) هنوز از سوی فروشنده اعلام نشده است. تا زمانی که این شرایط در همین صفحه درج شود،
          لطفاً پیش از ثبت سفارش با فروشنده تماس بگیرید.
        </PendingPolicyNote>
      </section>

      <section aria-labelledby="terms-privacy-link">
        <h2 id="terms-privacy-link">۶) حریم خصوصی</h2>
        <p>
          نحوهٔ نگهداری و استفاده از اطلاعات شخصی شما در صفحهٔ{' '}
          <a
            href={ROUTES.privacy}
            className="font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
          >
            حریم خصوصی
          </a>{' '}
          توضیح داده شده است.
        </p>
      </section>
    </LegalDocument>
  )
}
