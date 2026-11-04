/**
 * Interactive, on-page tours. Each step points at a REAL element of the running
 * storefront (by `data-help`, id or href) so the helper can highlight the exact
 * button. Steps never click, type or submit anything on the customer's behalf.
 * A step whose element is not on screen (not signed in, empty cart, other page …)
 * says so honestly instead of pretending.
 */
import { ROUTES } from './routes'

export interface TourStep {
  /** CSS selector; the first VISIBLE match is highlighted. Omit for a text-only step. */
  target?: string
  title: string
  text: string
  /** Shown when the target is not currently on screen. */
  missing?: string
  /** The step is only meaningful on pages whose pathname matches this RegExp source. */
  onRoute?: string
  /** Where to send the customer when they are not on the right page. */
  goto?: { to: string; label: string }
  /** Show only for guests or only for signed-in customers. */
  when?: 'guest' | 'authenticated'
  /** Move on automatically when the customer clicks the highlighted element. */
  advanceOnClick?: boolean
}

export interface Tour {
  id: string
  title: string
  /** Page the tour opens on. */
  start: string
  steps: readonly TourStep[]
}

const q = (name: string) => `[data-help="${name}"]`

export const TOURS: readonly Tour[] = [
  {
    id: 'login',
    title: 'ورود با پیامک',
    start: ROUTES.home,
    steps: [
      { when: 'guest', target: q('account-button'), advanceOnClick: true, title: 'دکمهٔ ورود', text: 'روی این آیکون (کاربر) در بالای صفحه بزنید تا پنجرهٔ ورود باز شود.', missing: 'این دکمه در نوار بالای صفحه است؛ اگر آن را نمی‌بینید صفحه را کمی به بالا ببرید.' },
      { when: 'guest', target: '#login-mobile', title: 'شمارهٔ موبایل', text: 'شمارهٔ ۱۱ رقمی موبایل خود را اینجا بنویسید. ثبت‌نام جداگانه ندارد؛ حساب شما همان لحظه ساخته می‌شود.', missing: 'پنجرهٔ ورود هنوز باز نشده است. به مرحلهٔ قبل برگردید و دکمهٔ ورود را بزنید.' },
      { when: 'guest', target: q('login-send-code'), title: 'دریافت کد تایید', text: 'این دکمه کد ۶ رقمی را پیامک می‌کند. کد حدود ۵ دقیقه اعتبار دارد.', missing: 'این دکمه فقط در مرحلهٔ اول پنجرهٔ ورود (وارد کردن موبایل) دیده می‌شود.' },
      { when: 'guest', target: '#login-otp-code', title: 'کد پیامکی', text: 'کد ۶ رقمی دریافتی را اینجا وارد کنید. آن را به هیچ‌کس، حتی به نام پشتیبانی، نگویید.', missing: 'این کادر بعد از ارسال کد ظاهر می‌شود. ابتدا موبایل را وارد و «دریافت کد تایید» را بزنید.' },
      { when: 'guest', target: q('login-verify'), title: 'ورود به حساب', text: 'پس از وارد کردن کد، این دکمه شما را وارد حساب می‌کند.', missing: 'این دکمه پس از ارسال کد (مرحلهٔ دوم پنجره) دیده می‌شود.' },
      { when: 'guest', target: q('login-resend'), title: 'پیامک نرسید؟', text: 'پس از پایان شمارش معکوس، «ارسال مجدد کد» فعال می‌شود. «تغییر شماره» هم در کنار آن است.', missing: 'این دکمه در مرحلهٔ دوم پنجرهٔ ورود، کنار شمارش معکوس، نمایش داده می‌شود.' },
      { when: 'authenticated', target: q('account-button'), title: 'شما وارد شده‌اید', text: 'با این دکمه منوی حساب باز می‌شود: حساب کاربری، سفارش‌های من و خروج از حساب.' },
    ],
  },
  {
    id: 'shopping',
    title: 'پیدا کردن کالا و افزودن به سبد',
    start: ROUTES.home,
    steps: [
      { target: 'input[aria-label="جستجو در محصولات"], button[aria-label="جستجو"]', title: 'جستجو', text: 'نام کالا را اینجا بنویسید. در موبایل ابتدا آیکون ذره‌بین را بزنید. دسته‌بندی کالاها هم از منوی سایت در دسترس است.' },
      { onRoute: '^/products/', goto: { to: ROUTES.categories, label: 'رفتن به دسته‌بندی کالاها' }, target: q('product-variants'), title: 'انتخاب تنوع', text: 'اگر کالا چند تنوع دارد (اندازه، رنگ …) ابتدا تنوع دلخواه را انتخاب کنید؛ قیمت و موجودی همان تنوع نمایش داده می‌شود.', missing: 'یک کالا را باز کنید. اگر این کالا فقط یک تنوع دارد، انتخابی لازم نیست.' },
      { onRoute: '^/products/', goto: { to: ROUTES.categories, label: 'رفتن به دسته‌بندی کالاها' }, target: q('add-to-cart'), advanceOnClick: true, title: 'افزودن به سبد خرید', text: 'این دکمه کالا را به سبد اضافه می‌کند. برای افزودن لازم نیست وارد شوید.', missing: 'اگر به جای این دکمه کنترل تعداد (+ و −) می‌بینید، کالا قبلاً در سبد است. اگر دکمه خاکستری است، تنوع انتخابی موجود نیست.' },
      { target: q('cart-link'), advanceOnClick: true, title: 'سبد خرید', text: 'عدد روی این آیکون تعداد کالاهای سبد است. با زدن آن صفحهٔ سبد باز می‌شود.' },
      { onRoute: '^/cart$', goto: { to: ROUTES.cart, label: 'رفتن به سبد خرید' }, target: q('cart-items'), title: 'اقلام سبد', text: 'اینجا تعداد هر کالا را کم و زیاد یا آن را حذف می‌کنید.', missing: 'سبد شما خالی است. ابتدا یک کالا اضافه کنید.' },
      { onRoute: '^/cart$', goto: { to: ROUTES.cart, label: 'رفتن به سبد خرید' }, target: q('cart-continue'), title: 'ادامهٔ خرید', text: 'با این دکمه به مرحلهٔ نشانی می‌روید. اگر وارد نشده‌اید، همین‌جا ورود با موبایل خواسته می‌شود و سبد شما حفظ می‌شود.', missing: 'این دکمه فقط وقتی سبد کالا دارد نمایش داده می‌شود.' },
    ],
  },
  {
    id: 'checkout',
    title: 'نشانی، ارسال و ثبت سفارش',
    start: ROUTES.checkout,
    steps: [
      { onRoute: '^/checkout$', goto: { to: ROUTES.cart, label: 'رفتن به سبد خرید' }, target: q('checkout-saved-addresses'), title: 'نشانی‌های ذخیره‌شده', text: 'اگر قبلاً نشانی ذخیره کرده‌اید، با زدن روی آن فرم خودکار پر می‌شود. این نشانی‌ها از «مدیریت نشانی‌ها» ساخته می‌شوند.', missing: 'این بخش پس از ورود و داشتن کالا در سبد دیده می‌شود. اگر وارد نشده‌اید ابتدا با موبایل وارد شوید.' },
      { onRoute: '^/checkout$', target: '#recipient', title: 'نام تحویل‌گیرنده', text: 'نام کسی که سفارش را تحویل می‌گیرد؛ پس از آن موبایل ۱۱ رقمی او را وارد کنید.', missing: 'فرم نشانی پس از ورود و داشتن کالا در سبد نمایش داده می‌شود.' },
      { onRoute: '^/checkout$', target: '#province', title: 'استان و شهر', text: 'استان را از فهرست انتخاب و نام شهر را بنویسید.', missing: 'فرم نشانی هنوز نمایش داده نشده است.' },
      { onRoute: '^/checkout$', target: '#postalCode', title: 'کد پستی', text: 'کد پستی ۱۰ رقمی معتبر لازم است. بعد از آن نشانی کامل (حداقل ۱۰ نویسه) را بنویسید.', missing: 'فرم نشانی هنوز نمایش داده نشده است.' },
      { onRoute: '^/checkout$', target: q('checkout-calc-shipping'), advanceOnClick: true, title: 'محاسبه هزینه ارسال', text: 'پس از پر کردن فرم، این دکمه هزینه و روش‌های ارسال را از سرور می‌گیرد. هنوز سفارشی ثبت نمی‌شود.', missing: 'این دکمه در انتهای فرم نشانی است.' },
      { onRoute: '^/checkout$', target: q('checkout-shipping'), title: 'انتخاب روش ارسال', text: 'روش ارسال دلخواه را انتخاب کنید؛ هزینهٔ هر روش کنار آن نوشته شده است.', missing: 'این بخش پس از «محاسبه هزینه ارسال» ظاهر می‌شود. اگر خطا دارد، پیام قرمز بالای فرم را بخوانید.' },
      { onRoute: '^/checkout$', target: q('checkout-place-order'), title: 'ثبت سفارش', text: 'این دکمه سفارش را می‌سازد و کالا را برای شما رزرو می‌کند. ثبت سفارش به معنی پرداخت نیست؛ پرداخت در مرحلهٔ بعد انجام می‌شود.', missing: 'این دکمه پس از محاسبهٔ ارسال و انتخاب روش ارسال فعال می‌شود.' },
    ],
  },
  {
    id: 'payment',
    title: 'پرداخت آنلاین',
    start: ROUTES.orders,
    steps: [
      { onRoute: '^/payment/', goto: { to: ROUTES.orders, label: 'رفتن به سفارش‌های من' }, target: q('pay-button'), title: 'پرداخت با زرین‌پال', text: 'این دکمه شما را به درگاه بانکی می‌برد. تا پایان مهلت رزرو فرصت پرداخت دارید.', missing: 'صفحهٔ پرداخت پس از ثبت سفارش باز می‌شود (از سفارش «در انتظار پرداخت» روی «بررسی وضعیت پرداخت» بزنید). اگر سفارش پرداخت‌شده، لغوشده یا مهلت‌گذشته باشد این دکمه نمایش داده نمی‌شود.' },
      { onRoute: '^/payment/', goto: { to: ROUTES.orders, label: 'رفتن به سفارش‌های من' }, target: q('payment-recheck'), title: 'بررسی دوبارهٔ وضعیت', text: 'پس از بازگشت از درگاه، با این دکمه وضعیت را از سرور بخوانید. فقط پیام «پرداخت توسط سرور تأیید شد» یعنی پرداخت موفق بوده است.', missing: 'این دکمه در صفحهٔ وضعیت پرداخت دیده می‌شود.' },
    ],
  },
  {
    id: 'track-order',
    title: 'پیگیری و لغو سفارش',
    start: ROUTES.home,
    steps: [
      { target: q('account-button'), advanceOnClick: true, title: 'منوی حساب', text: 'پس از ورود، روی این آیکون بزنید تا منوی حساب باز شود.' },
      { target: 'a[href="/orders"]', title: 'سفارش‌های من', text: 'همهٔ سفارش‌ها و وضعیت پرداخت و ارسال آن‌ها اینجاست.', missing: 'این گزینه پس از ورود و باز کردن منوی حساب دیده می‌شود.' },
      { onRoute: '^/orders$', goto: { to: ROUTES.orders, label: 'رفتن به سفارش‌های من' }, target: q('orders-list'), title: 'فهرست سفارش‌ها', text: 'روی هر سفارش بزنید تا اقلام، مبلغ، تلاش‌های پرداخت، ارسال و کد رهگیری را ببینید.', missing: 'هنوز سفارشی ندارید یا وارد نشده‌اید.' },
      { onRoute: '^/orders/', goto: { to: ROUTES.orders, label: 'رفتن به سفارش‌های من' }, target: q('order-check-payment'), title: 'بررسی وضعیت پرداخت', text: 'برای سفارشی که هنوز پرداخت نشده، این دکمه به صفحهٔ پرداخت می‌برد.', missing: 'یکی از سفارش‌ها را باز کنید. این دکمه فقط برای سفارش «در انتظار پرداخت» نمایش داده می‌شود.' },
      { onRoute: '^/orders/', goto: { to: ROUTES.orders, label: 'رفتن به سفارش‌های من' }, target: q('order-cancel'), title: 'لغو سفارش پرداخت‌نشده', text: 'فقط سفارش پرداخت‌نشده از اینجا لغو می‌شود و رزرو کالا آزاد می‌شود. لغو به معنی استرداد وجه نیست؛ اگر در درگاه پرداخت کرده‌اید ابتدا وضعیت پرداخت را ببینید.', missing: 'این گزینه فقط برای سفارش «در انتظار پرداخت» نمایش داده می‌شود.' },
    ],
  },
  {
    id: 'account',
    title: 'حساب، نشانی‌ها و امنیت',
    start: ROUTES.account,
    steps: [
      { onRoute: '^/account$', goto: { to: ROUTES.account, label: 'رفتن به حساب کاربری' }, target: '#account-mobile', title: 'پروفایل', text: 'نام و مشخصات را ویرایش و ذخیره کنید. شمارهٔ موبایل تأییدشده قابل تغییر نیست.', missing: 'برای دیدن حساب، ابتدا وارد شوید.' },
      { onRoute: '^/account$', target: 'a[href="/account/addresses"]', title: 'مدیریت نشانی‌ها', text: 'نشانی‌های ذخیره‌شده برای خریدهای بعدی. تغییر آن‌ها نشانی سفارش‌های قبلی را عوض نمی‌کند.', missing: 'این گزینه پس از ورود دیده می‌شود.' },
      { onRoute: '^/account$', target: 'a[href="/account/security"]', title: 'مدیریت نشست‌ها', text: 'دستگاه‌هایی را که وارد حساب شما هستند ببینید و نشست ناشناس را ببندید.', missing: 'این گزینه پس از ورود دیده می‌شود.' },
    ],
  },
  {
    id: 'custom-door',
    title: 'سفارش ساخت درب',
    start: ROUTES.customDoors,
    steps: [
      { onRoute: '^/custom-doors$', goto: { to: ROUTES.customDoors, label: 'رفتن به سفارش ساخت درب' }, target: q('door-type'), title: 'نوع درب', text: 'فریم‌لس یا دکوفیکس را انتخاب کنید.', missing: 'فهرست مدل‌ها هنوز از سرور دریافت نشده است؛ کمی صبر کنید.' },
      { onRoute: '^/custom-doors$', target: q('door-models'), title: 'مدل و متریال', text: 'یکی از مدل‌های ثبت‌شده را بزنید تا فرم ابعاد باز شود.', missing: 'مدل تأییدشده‌ای هنوز برای این نوع ثبت نشده است.' },
      { onRoute: '^/custom-doors$', target: q('door-width'), title: 'عرض', text: 'عرض نهایی را به میلی‌متر بنویسید (عدد صحیح مثبت). عرض افقی درب است.', missing: 'این کادر پس از انتخاب مدل باز می‌شود.' },
      { onRoute: '^/custom-doors$', target: q('door-height'), title: 'ارتفاع', text: 'ارتفاع عمودی را به میلی‌متر بنویسید. ابعاد برش را سامانه از قواعد مدل حساب می‌کند.', missing: 'این کادر پس از انتخاب مدل باز می‌شود.' },
      { onRoute: '^/custom-doors$', target: q('door-quantity'), title: 'تعداد', text: 'تعداد درب با همین مشخصات (تا ۱۰۰۰). برای اندازهٔ دیگر، درب جدیدی اضافه کنید (تا ۵۰ ردیف).', missing: 'این کادر پس از انتخاب مدل باز می‌شود.' },
      { onRoute: '^/custom-doors$', target: q('door-add'), title: 'افزودن این درب', text: 'درب را به فهرست سفارش می‌افزاید. می‌توانید چند درب با اندازه‌های مختلف اضافه کنید.', missing: 'این دکمه پس از انتخاب مدل در فرم ابعاد است.' },
      { onRoute: '^/custom-doors$', target: q('door-review'), title: 'محاسبه و بررسی', text: 'قیمت و مشخصات از سرور بازبینی می‌شود. هنوز چیزی ثبت یا پرداخت نمی‌شود.', missing: 'این دکمه پس از افزودن حداقل یک درب نمایش داده می‌شود.' },
      { onRoute: '^/custom-doors$', target: q('door-submit'), title: 'ثبت سفارش', text: 'سفارش را ثبت می‌کند؛ پرداخت نیست. قیمت قطعی و بیعانه را بعداً در «سفارش‌های ساخت درب من» تأیید و پرداخت می‌کنید.', missing: 'این دکمه در مرحلهٔ بازبینی نهایی است.' },
      { onRoute: '^/custom-doors$', target: q('door-save-draft'), title: 'ذخیرهٔ پیش‌نویس', text: 'اگر آمادهٔ ثبت نیستید، پیش‌نویس را در حساب نگه دارید و بعداً ویرایش و ارسال کنید.', missing: 'این دکمه در مرحلهٔ بازبینی نهایی است.' },
    ],
  },
]

export function tourById(id: string): Tour | undefined {
  return TOURS.find(tour => tour.id === id)
}
