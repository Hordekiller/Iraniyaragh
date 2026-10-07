import { LegalDocument } from '../components/legal/LegalDocument'
import { Link } from 'react-router-dom'
import { ROUTES } from '../lib/routes'

// Restored from storefront-completion, adapted to the current server-backed flow.
export function PrivacyPage() {
  return (
    <LegalDocument
      title="حریم خصوصی"
      intro="این صفحه توضیح می‌دهد فروشگاه چه اطلاعاتی از شما می‌گیرد و برای چه کاری از آن استفاده می‌کند. فهرست زیر بر اساس رفتار واقعی همین فروشگاه نوشته شده است."
    >
      <section aria-labelledby="privacy-collected">
        <h2 id="privacy-collected">۱) اطلاعاتی که جمع‌آوری می‌شود</h2>
        <ul>
          <li>
            <span aria-hidden="true">•</span>
            <span>
              <strong className="font-black text-slate-900">شماره موبایل</strong> — برای ورود با
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
              سبد مهمان در سامانهٔ فروشگاه نگهداری می‌شود. کوکی‌های ضروری مرورگر، سبد شما را
              شناسایی می‌کنند تا با ورود به حساب، اقلام آن به سبد حساب منتقل شوند.
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
          اطلاعات حساب، نشانی و سفارش برای ارائهٔ خدمات فروشگاه و تحویل سفارش استفاده می‌شود.
          هنگام استفاده از پیامک، پرداخت یا ارسال، اطلاعات لازم برای همان خدمت در اختیار ارائه‌دهندهٔ آن قرار می‌گیرد.
          ثبت سفارش به معنی تأیید پرداخت یا ارسال پیامک نیست.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">۴) حقوق شما</h2>
        <p>
          پس از ورود می‌توانید از <Link to={ROUTES.account} className="font-bold underline">حساب کاربری</Link>، نام و نام خانوادگی خود را اصلاح کنید،
          نشانی‌ها را مدیریت کنید، سفارش‌ها را ببینید و نشست‌های فعال را ببندید. تغییر نشانی‌های حساب، نشانی سفارش‌های قبلی را تغییر نمی‌دهد.
          امکان درخواست خودکار خروجی اطلاعات یا بستن دائمی حساب در حال حاضر فراهم نیست.
        </p>
      </section>

      <section aria-labelledby="privacy-terms-link">
        <h2 id="privacy-terms-link">۵) شرایط فروش</h2>
        <p>
          شرایط پرداخت، تحویل و سایر موارد مرتبط با خرید در صفحهٔ{' '}
          <Link
            to={ROUTES.terms}
            className="font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
          >
            قوانین و شرایط فروش
          </Link>{' '}
          توضیح داده شده است.
        </p>
      </section>
    </LegalDocument>
  )
}
