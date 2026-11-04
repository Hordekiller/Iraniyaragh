/**
 * Context-aware page help. The always-available helper looks at the page the
 * customer is on, shows where they are in the purchase journey and explains each
 * real button of that page. It only explains and highlights — it never clicks,
 * types or submits for the customer, and it says so when a button is not shown.
 */
import { ROUTES } from './routes'

export type StageId = 'browse' | 'product' | 'cart' | 'login' | 'address' | 'pay' | 'track'

export const STAGES: readonly { id: StageId; label: string }[] = [
  { id: 'browse', label: 'انتخاب کالا' },
  { id: 'product', label: 'صفحهٔ کالا' },
  { id: 'cart', label: 'سبد خرید' },
  { id: 'login', label: 'ورود' },
  { id: 'address', label: 'نشانی و ارسال' },
  { id: 'pay', label: 'پرداخت' },
  { id: 'track', label: 'پیگیری' },
]

export interface HelpContext { signedIn: boolean; cartCount: number }

export interface GuideItem {
  /** CSS selector of the real element; the first visible match is highlighted. */
  target?: string
  title: string
  text: string | ((ctx: HelpContext) => string)
  /** Said when the element is not on screen right now. */
  missing?: string
}

export interface PageGuide {
  id: string
  match: RegExp
  stage?: StageId
  title: string
  summary: string | ((ctx: HelpContext) => string)
  items: readonly GuideItem[]
  next?: { to: string; label: string }
}

const q = (name: string) => `[data-help="${name}"]`
const SEARCH = 'input[aria-label="جستجو در محصولات"], button[aria-label="جستجو"]'
const PRODUCT_LINK = 'a[href^="/products/"]'

const searchItem: GuideItem = { target: SEARCH, title: 'جستجو', text: 'نام کالا را بنویسید. در موبایل ابتدا آیکون ذره‌بین را بزنید.' }
const cartItem: GuideItem = { target: q('cart-link'), title: 'سبد خرید', text: 'عدد روی آیکون تعداد کالاهای سبد است. با زدن آن به سبد می‌روید.' }
const accountItem: GuideItem = { target: q('account-button'), title: 'ورود / حساب کاربری', text: ctx => ctx.signedIn ? 'منوی حساب: حساب کاربری، سفارش‌های من و خروج.' : 'برای ورود با پیامک این آیکون را بزنید. برای افزودن کالا به سبد نیازی به ورود نیست.' }
const productCards: GuideItem = { target: PRODUCT_LINK, title: 'کالاها', text: 'روی یک کالا بزنید تا قیمت، موجودی و تنوع‌های آن را ببینید.', missing: 'کالایی در این صفحه نمایش داده نمی‌شود؛ عبارت دیگری جستجو کنید یا دسته‌ای دیگر را باز کنید.' }

export const PAGE_GUIDES: readonly PageGuide[] = [
  {
    id: 'order-detail', match: /^\/orders\/[^/]+$/u, stage: 'track', title: 'جزئیات سفارش',
    summary: 'اقلام، مبالغ، تلاش‌های پرداخت، ارسال و تاریخچهٔ وضعیت این سفارش.',
    items: [
      { target: q('order-check-payment'), title: 'بررسی وضعیت پرداخت', text: 'برای سفارش پرداخت‌نشده، شما را به صفحهٔ پرداخت می‌برد.', missing: 'این دکمه فقط برای سفارش «در انتظار پرداخت» نمایش داده می‌شود. این سفارش در آن وضعیت نیست.' },
      { target: q('order-cancel'), title: 'لغو سفارش پرداخت‌نشده', text: 'رزرو کالا را آزاد می‌کند. لغو به معنی استرداد وجه نیست؛ اگر در درگاه پرداخت کرده‌اید ابتدا وضعیت پرداخت را ببینید.', missing: 'لغو فقط برای سفارش پرداخت‌نشده ممکن است و این سفارش در آن وضعیت نیست.' },
      { target: 'a[href="/orders"]', title: 'بازگشت به سفارش‌ها', text: 'به فهرست همهٔ سفارش‌هایتان برمی‌گردید.' },
    ],
  },
  {
    id: 'orders', match: /^\/orders$/u, stage: 'track', title: 'سفارش‌های من',
    summary: 'همهٔ سفارش‌ها با وضعیت پرداخت و ارسال. برای پیگیری، یک سفارش را باز کنید.',
    items: [
      { target: q('orders-list'), title: 'فهرست سفارش‌ها', text: 'روی هر سفارش بزنید تا اقلام، پرداخت، ارسال و کد رهگیری را ببینید.', missing: 'سفارشی نمایش داده نمی‌شود: یا هنوز سفارشی ندارید، یا وارد حساب نشده‌اید.' },
      { target: 'a[href="/account/notifications"], [aria-label*="اعلان"]', title: 'اعلان‌ها', text: 'تغییر وضعیت سفارش و پرداخت در اعلان‌ها هم ثبت می‌شود.', missing: 'اعلان‌ها پس از ورود در نوار بالای صفحه نمایش داده می‌شوند.' },
    ],
  },
  {
    id: 'payment', match: /^\/payment\/[^/]+(?:\/result)?$/u, stage: 'pay', title: 'پرداخت سفارش',
    summary: 'پرداخت از طریق درگاه زرین‌پال. فقط پیام «پرداخت توسط سرور تأیید شد» نشانهٔ پرداخت موفق است.',
    items: [
      { target: q('pay-button'), title: 'پرداخت با زرین‌پال', text: 'شما را به درگاه بانکی می‌برد. تا پایان مهلت رزرو فرصت پرداخت دارید.', missing: 'این دکمه نمایش داده نمی‌شود، یعنی سفارش پرداخت‌شده، لغوشده یا مهلت‌گذشته است یا وضعیت آن باید بررسی شود. پیام بالای صفحه علت را می‌گوید.' },
      { target: q('payment-recheck'), title: 'بررسی دوبارهٔ وضعیت', text: 'پس از بازگشت از درگاه، وضعیت را از سرور بخوانید. اگر پول کم شده ولی تأیید نشد، پرداخت دوباره انجام ندهید.', missing: 'این دکمه پس از بارگذاری وضعیت پرداخت دیده می‌شود.' },
      { target: 'a[href^="/orders/"]', title: 'جزئیات سفارش', text: 'اقلام و تاریخچهٔ پرداخت و ارسال سفارش را ببینید.', missing: 'پیوند جزئیات سفارش پس از بارگذاری صفحه نمایش داده می‌شود.' },
    ],
    next: { to: ROUTES.orders, label: 'پیگیری سفارش' },
  },
  {
    id: 'payment-return', match: /^\/payment-return$/u, stage: 'pay', title: 'بازگشت از درگاه',
    summary: 'بازگشت از درگاه به‌تنهایی پرداخت موفق نیست؛ نتیجه را از سفارش‌ها بخوانید. اگر مبلغ کم شده ولی سفارش پرداخت‌شده نیست، با پشتیبانی تماس بگیرید.',
    items: [{ target: 'a[href="/orders"]', title: 'مشاهدهٔ سفارش‌ها', text: 'وضعیت پرداخت تأییدشدهٔ سرور را اینجا ببینید.' }],
    next: { to: ROUTES.orders, label: 'سفارش‌های من' },
  },
  {
    id: 'checkout', match: /^\/checkout$/u, stage: 'address', title: 'نشانی و روش ارسال',
    summary: ctx => ctx.signedIn ? 'نشانی تحویل را ثبت، هزینهٔ ارسال را محاسبه، روش ارسال را انتخاب و سفارش را ثبت کنید. پس از ثبت، خودکار به صفحهٔ پرداخت می‌روید.' : 'برای ادامه ابتدا با موبایل وارد شوید؛ سبد شما حفظ می‌شود. سپس فرم نشانی باز می‌شود.',
    items: [
      { target: q('checkout-saved-addresses'), title: 'نشانی‌های ذخیره‌شده', text: 'روی یک نشانی ذخیره‌شده بزنید تا فرم خودکار پر شود.', missing: 'این بخش پس از ورود و داشتن کالا در سبد دیده می‌شود.' },
      { target: '#recipient', title: 'نام و موبایل تحویل‌گیرنده', text: 'نام کسی که سفارش را تحویل می‌گیرد و موبایل ۱۱ رقمی او.', missing: 'فرم پس از ورود و داشتن کالا در سبد نمایش داده می‌شود.' },
      { target: '#province', title: 'استان و شهر', text: 'استان را از فهرست انتخاب و شهر را بنویسید.', missing: 'فرم نشانی نمایش داده نمی‌شود.' },
      { target: '#postalCode', title: 'کد پستی', text: 'کد پستی معتبر ۱۰ رقمی.', missing: 'فرم نشانی نمایش داده نمی‌شود.' },
      { target: '#address', title: 'نشانی کامل', text: 'حداقل ۱۰ نویسه؛ خیابان، پلاک و واحد را بنویسید.', missing: 'فرم نشانی نمایش داده نمی‌شود.' },
      { target: q('checkout-calc-shipping'), title: 'محاسبه هزینه ارسال', text: 'هزینه و روش‌های ارسال را از سرور می‌گیرد. هنوز سفارشی ثبت نمی‌شود.', missing: 'این دکمه در انتهای فرم نشانی است.' },
      { target: q('checkout-shipping'), title: 'روش ارسال', text: 'یکی از روش‌ها را انتخاب کنید؛ هزینهٔ هر کدام کنارش نوشته شده است.', missing: 'پس از «محاسبه هزینه ارسال» ظاهر می‌شود. اگر خطا دارد پیام قرمز بالای فرم را بخوانید.' },
      { target: q('checkout-place-order'), title: 'ثبت سفارش', text: 'سفارش را می‌سازد و کالا را رزرو می‌کند. این دکمه پرداخت نیست؛ پرداخت در مرحلهٔ بعد است.', missing: 'پس از محاسبهٔ ارسال و انتخاب روش ارسال فعال می‌شود.' },
    ],
  },
  {
    id: 'cart', match: /^\/cart$/u, stage: 'cart', title: 'سبد خرید',
    summary: ctx => ctx.cartCount === 0 ? 'سبد شما خالی است. یک کالا انتخاب و از صفحهٔ آن به سبد اضافه کنید.' : 'اقلام را بررسی کنید و ادامه دهید. قیمت و موجودی در مرحلهٔ بعد دوباره از سرور بررسی می‌شود.',
    items: [
      { target: q('cart-items'), title: 'اقلام سبد', text: 'تعداد هر کالا را کم و زیاد یا آن را حذف کنید. حداکثر ۹۹ عدد برای هر قلم.', missing: 'سبد خالی است.' },
      { target: q('cart-continue'), title: 'ادامهٔ خرید', text: ctx => ctx.signedIn ? 'شما را به مرحلهٔ نشانی و ارسال می‌برد.' : 'ورود سریع با موبایل باز می‌شود؛ پس از ورود، سبد مهمان به حساب شما منتقل می‌شود.', missing: 'این دکمه فقط وقتی سبد کالا دارد دیده می‌شود.' },
    ],
    next: { to: ROUTES.checkout, label: 'نشانی و ارسال' },
  },
  {
    id: 'product', match: /^\/products?\/[^/]+$/u, stage: 'product', title: 'صفحهٔ کالا',
    summary: 'قیمت، موجودی و مشخصات کالا. تنوع (اندازه/رنگ) را انتخاب و به سبد اضافه کنید. هزینهٔ ارسال بعد از ثبت نشانی محاسبه می‌شود.',
    items: [
      { target: q('product-variants'), title: 'انتخاب تنوع', text: 'قیمت و موجودی بر اساس تنوع انتخابی نمایش داده می‌شود. تنوع ناموجود قابل انتخاب نیست.', missing: 'این کالا فقط یک تنوع دارد یا هنوز بارگذاری نشده؛ انتخابی لازم نیست.' },
      { target: q('add-to-cart'), title: 'افزودن به سبد خرید', text: 'کالا را به سبد می‌افزاید. لازم نیست وارد شده باشید.', missing: 'اگر به جای این دکمه کنترل تعداد (+ و −) می‌بینید، کالا قبلاً در سبد است. دکمهٔ خاکستری یعنی تنوع انتخابی موجود نیست.' },
      { target: q('view-cart'), title: 'مشاهده سبد', text: 'سبد را باز می‌کند تا ادامهٔ خرید را بزنید.', missing: 'در این چیدمان از آیکون سبد بالای صفحه استفاده کنید.' },
    ],
    next: { to: ROUTES.cart, label: 'سبد خرید' },
  },
  {
    id: 'search', match: /^\/search$/u, stage: 'browse', title: 'نتایج جستجو',
    summary: 'کالاهای مطابق عبارت جستجو. اگر نتیجه‌ای نیست عبارت ساده‌تر یا دسته‌بندی‌ها را امتحان کنید.',
    items: [searchItem, productCards, cartItem],
  },
  {
    id: 'browse', match: /^\/(?:categories(?:\/[^/]+)?|category\/[^/]+|brands\/[^/]+|catalog|bestsellers)$/u, stage: 'browse', title: 'انتخاب کالا',
    summary: 'دسته یا برند را باز کنید و کالای مورد نظر را انتخاب کنید.',
    items: [searchItem, productCards, cartItem, accountItem],
  },
  {
    id: 'custom-doors', match: /^\/custom-doors$/u, title: 'سفارش ساخت درب',
    summary: 'درب فریم‌لس یا دکوفیکس با اندازهٔ دلخواه. ثبت سفارش پرداخت نیست؛ قیمت و بیعانه بعداً در حساب شما تأیید و پرداخت می‌شود.',
    items: [
      { target: q('door-type'), title: 'نوع درب', text: 'فریم‌لس یا دکوفیکس.', missing: 'فهرست مدل‌ها هنوز دریافت نشده است.' },
      { target: q('door-models'), title: 'مدل و متریال', text: 'یک مدل را بزنید تا فرم ابعاد باز شود.', missing: 'مدل تأییدشده‌ای برای این نوع ثبت نشده است.' },
      { target: q('door-width'), title: 'عرض (میلی‌متر)', text: 'عرض افقی نهایی؛ عدد صحیح مثبت.', missing: 'پس از انتخاب مدل باز می‌شود.' },
      { target: q('door-height'), title: 'ارتفاع (میلی‌متر)', text: 'ارتفاع عمودی نهایی. ابعاد برش را سامانه حساب می‌کند.', missing: 'پس از انتخاب مدل باز می‌شود.' },
      { target: q('door-quantity'), title: 'تعداد', text: 'تعداد درب با همین مشخصات (تا ۱۰۰۰).', missing: 'پس از انتخاب مدل باز می‌شود.' },
      { target: q('door-add'), title: 'افزودن این درب', text: 'درب را به فهرست سفارش می‌افزاید؛ تا ۵۰ ردیف.', missing: 'پس از انتخاب مدل باز می‌شود.' },
      { target: q('door-review'), title: 'محاسبه و بررسی', text: 'قیمت و مشخصات را از سرور بازبینی می‌کند؛ هنوز چیزی ثبت نمی‌شود.', missing: 'پس از افزودن حداقل یک درب دیده می‌شود.' },
      { target: q('door-submit'), title: 'ثبت سفارش', text: 'سفارش را ثبت می‌کند. پرداخت بیعانه بعد از تأیید قیمت قطعی انجام می‌شود.', missing: 'در مرحلهٔ بازبینی نهایی دیده می‌شود.' },
      { target: q('door-save-draft'), title: 'ذخیرهٔ پیش‌نویس', text: 'اگر آماده نیستید پیش‌نویس را در حساب نگه دارید.', missing: 'در مرحلهٔ بازبینی نهایی دیده می‌شود.' },
    ],
  },
  { id: 'my-doors', match: /^\/account\/custom-doors(?:\/[^/]+)?$/u, stage: 'track', title: 'سفارش‌های ساخت درب من', summary: 'وضعیت قیمت، تأیید مشخصات، بیعانه، تولید و تحویل. پس از تأیید قیمت قطعی، بیعانه را از همین صفحه می‌پردازید؛ پرداخت درب از سبد خرید انجام نمی‌شود.', items: [] },
  { id: 'addresses', match: /^\/account\/addresses$/u, title: 'دفتر نشانی‌ها', summary: 'نشانی‌ها را اضافه، ویرایش یا حذف و ذخیره کنید. تغییر آن‌ها نشانی سفارش‌های قبلی را عوض نمی‌کند.', items: [] },
  { id: 'security', match: /^\/account\/security$/u, title: 'امنیت و نشست‌ها', summary: 'دستگاه‌هایی که وارد حساب شما هستند. نشستی را که نمی‌شناسید ببندید.', items: [] },
  { id: 'notifications', match: /^\/account\/notifications$/u, title: 'اعلان‌ها', summary: 'تغییر وضعیت سفارش و پرداخت اینجا ثبت می‌شود. «همه را خوانده‌شده کن» فهرست را مرتب می‌کند.', items: [] },
  { id: 'invoices', match: /^\/account\/invoices(?:\/[^/]+)?$/u, title: 'فاکتورها', summary: 'فاکتورهای منتشرشده. فاکتور به‌تنهایی نشانهٔ پرداخت نیست؛ وضعیت پرداخت را در صفحهٔ سفارش ببینید.', items: [] },
  { id: 'credit', match: /^\/account\/credit$/u, title: 'صورتحساب و بدهی', summary: 'فقط برای مشتری دارای حساب اعتباری: مانده، اعتبار باقی‌مانده و اسناد بدهی.', items: [] },
  {
    id: 'account', match: /^\/account$/u, title: 'حساب کاربری', summary: 'پروفایل، سفارش‌ها، نشانی‌ها و امنیت حساب.',
    items: [
      { target: '#account-mobile', title: 'پروفایل', text: 'نام را ویرایش و «ذخیره پروفایل» را بزنید. شمارهٔ موبایل تأییدشده قابل تغییر نیست.', missing: 'برای دیدن حساب ابتدا وارد شوید.' },
      { target: 'a[href="/orders"]', title: 'مشاهده سفارش‌ها', text: 'پیگیری پرداخت و ارسال.', missing: 'پس از ورود دیده می‌شود.' },
      { target: 'a[href="/account/addresses"]', title: 'مدیریت نشانی‌ها', text: 'نشانی‌های ذخیره‌شده برای خرید بعدی.', missing: 'پس از ورود دیده می‌شود.' },
      { target: 'a[href="/account/security"]', title: 'مدیریت نشست‌ها', text: 'بستن نشست‌های ناشناس.', missing: 'پس از ورود دیده می‌شود.' },
    ],
  },
  { id: 'policy', match: /^\/policies\/[^/]+$/u, title: 'قوانین و حریم خصوصی', summary: 'متن شرایط فروش و حریم خصوصی. مواردی که فروشنده هنوز اعلام نکرده صریحاً مشخص شده است.', items: [] },
  { id: 'help', match: /^\/help(?:\/[^/]+)?$/u, title: 'مرکز راهنما', summary: 'راهنمای نوشتاری همهٔ مراحل. در هر صفحهٔ دیگر، دکمهٔ «راهنمای این صفحه» همان صفحه را روی دکمه‌های واقعی توضیح می‌دهد.', items: [] },
  {
    id: 'home', match: /^\/$/u, stage: 'browse', title: 'صفحهٔ اصلی فروشگاه',
    summary: 'شروع خرید: کالا را جستجو کنید یا از دسته‌بندی‌ها بگردید.',
    items: [
      searchItem,
      { target: 'button[aria-label="باز کردن منوی فروشگاه"]', title: 'منوی دسته‌بندی‌ها', text: 'همهٔ دسته‌ها و صفحه‌های فروشگاه از اینجا باز می‌شود.' },
      productCards, cartItem, accountItem,
    ],
    next: { to: ROUTES.categories, label: 'دسته‌بندی کالاها' },
  },
]

const FALLBACK: PageGuide = { id: 'generic', match: /./u, title: 'این صفحه', summary: 'برای راهنمای کامل مراحل خرید، مرکز راهنما را ببینید.', items: [searchItem, cartItem, accountItem] }

export function guideForPath(pathname: string): PageGuide {
  return PAGE_GUIDES.find(guide => guide.match.test(pathname)) ?? FALLBACK
}

/** The sign-in dialog covers the page, so while it is open it gets its own guide. */
export const LOGIN_GUIDES = {
  mobile: { id: 'login-mobile', match: /./u, stage: 'login', title: 'ورود با موبایل', summary: 'ثبت‌نام جداگانه ندارد؛ با شمارهٔ موبایل و کد پیامکی وارد می‌شوید و حساب شما همان لحظه ساخته می‌شود.', items: [
    { target: '#login-mobile', title: 'شمارهٔ موبایل', text: 'شمارهٔ ۱۱ رقمی خود را بنویسید.' },
    { target: q('login-send-code'), title: 'دریافت کد تایید', text: 'کد ۶ رقمی را پیامک می‌کند؛ حدود ۵ دقیقه اعتبار دارد.', missing: 'این دکمه تا وارد کردن شمارهٔ معتبر غیرفعال است.' },
  ] },
  code: { id: 'login-code', match: /./u, stage: 'login', title: 'کد تایید پیامکی', summary: 'کد ۶ رقمی را وارد کنید. آن را به هیچ‌کس، حتی به نام پشتیبانی، نگویید.', items: [
    { target: '#login-otp-code', title: 'کد ۶ رقمی', text: 'کد پیامک‌شده را اینجا بنویسید.' },
    { target: q('login-verify'), title: 'ورود به حساب', text: 'پس از وارد کردن کد، شما را وارد می‌کند و سبد مهمان به حساب منتقل می‌شود.', missing: 'تا وارد کردن ۶ رقم غیرفعال است.' },
    { target: q('login-resend'), title: 'ارسال مجدد کد', text: 'پس از پایان شمارش معکوس فعال می‌شود. اگر پیام «نتیجهٔ ارسال مشخص نیست» دیدید، ابتدا پیامک‌هایتان را بررسی کنید.' },
  ] },
} as const satisfies Record<string, PageGuide>
