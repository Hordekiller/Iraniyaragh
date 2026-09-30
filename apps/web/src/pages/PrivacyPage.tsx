import { LegalDocument } from '../components/legal/LegalDocument'
import { useDocumentMeta } from '../lib/use-document-meta'
import { ROUTES } from '../lib/routes'
import { SITE_NAME } from '../lib/site-config'

/**
 * Storefront privacy notice.
 *
 * Only describes what the app actually does: the fields the checkout form and
 * the OTP login collect, the guest cart draft kept in `localStorage`, the
 * session/CSRF cookies, and the absence of any third-party analytics. Nothing
 * about retention periods or data-subject tooling is claimed beyond that.
 */
export function PrivacyPage() {
  useDocumentMeta({
    title: 'حریم خصوصی',
    description: `اطلاعاتی که ${SITE_NAME} جمع‌آوری می‌کند و نحوهٔ استفاده از آن.`,
    canonicalPath: ROUTES.privacy,
  })

  return (
    <LegalDocument
      title="حریم خصوصی"
      intro="این صفحه توضیح می‌دهد فروشگاه چه اطلاعاتی از شما می‌گیرد و برای چه کاری از آن استفاده می‌کند. فهرست زیر بر اساس رفتار واقعی همین فروشگاه نوشته شده است."
      lastReviewed="۱۴۰۵/۰۷/۰۷"
    >
      <section aria-labelledby="privacy-collected">
        <h2 id="privacy-collected">۱) اطلاعاتی که جمع‌آوری می‌شود</h2>
        <ul>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              <strong className="font-black text-slate-900">شماره موبایل</strong> — فقط برای ورود با
              پیامک و برای اطلاع‌رسانی وضعیت سفارش.
            </span>
          </li>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              <strong className="font-black text-slate-900">اطلاعات گیرنده و ارسال</strong> — نام و
              نام خانوادگی، شماره موبایل، شهر، کد پستی و نشانی. این موارد در صفحهٔ تسویه‌حساب از شما
              دریافت می‌شود و برای تحویل سفارش لازم است.
            </span>
          </li>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              <strong className="font-black text-slate-900">اطلاعات سفارش</strong> — اقلام انتخاب‌شده و
              وضعیت پرداخت و ارسال، که در حساب کاربری شما نگهداری و نمایش داده می‌شود.
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="privacy-storage">
        <h2 id="privacy-storage">۲) ذخیره‌سازی در مرورگر</h2>
        <ul>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              اگر پیش از ورود اقلامی به سبد خرید اضافه کنید، سبد خرید به‌صورت محلی در مرورگر شما
              نگهداری می‌شود تا پس از ورود، همان اقلام به حساب شما منتقل شود.
            </span>
          </li>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              پس از ورود، وضعیت نشست شما در یک کوکی امن نگهداری می‌شود و یک کوکی جداگانه برای محافظت
              در برابر درخواست‌های جعلی (CSRF) استفاده می‌شود.
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="privacy-no-sharing">
        <h2 id="privacy-no-sharing">۳) اشتراک‌گذاری</h2>
        <p>
          اطلاعات شما فقط برای ارائهٔ خدمات فروشگاه، یعنی پردازش و تحویل سفارش، استفاده می‌شود. این
          فروشگاه هیچ ابزار تبلیغاتی یا تحلیل رفتار کاربر از سوی شخص ثالث در صفحات خود اجرا نمی‌کند.
          برای تحویل مرسوله، اطلاعات لازم در اختیار شرکت حمل‌کننده قرار می‌گیرد.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">۴) حقوق شما</h2>
        <p>
          شما می‌توانید اطلاعات حساب خود را از بخش «حساب کاربری» مشاهده کنید و در صورت نیاز به اصلاح
          یا حذف آن، با فروشنده تماس بگیرید. اطلاعات تماس در پای همین صفحه درج شده است.
        </p>
      </section>

      <section aria-labelledby="privacy-terms-link">
        <h2 id="privacy-terms-link">۵) شرایط فروش</h2>
        <p>
          شرایط پرداخت، تحویل و سایر موارد مرتبط با خرید در صفحهٔ{' '}
          <a
            href={ROUTES.terms}
            className="font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
          >
            قوانین و شرایط فروش
          </a>{' '}
          توضیح داده شده است.
        </p>
      </section>
    </LegalDocument>
  )
}
