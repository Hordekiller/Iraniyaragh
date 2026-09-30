# نقشهٔ یکپارچه‌سازی MVP موجود ایرانی‌یراق

بازبینی: ۱۴۰۵/۰۷/۰۸ (2026-09-30). خواستهٔ فعلی مالک پروژه: فعلاً فقط
قابلیت‌ها و UI موجود را به یک نسخهٔ واحد و صادقانه وصل کنیم؛ استقرار VPS و
توسعهٔ قابلیت‌های جدید مرحلهٔ بعد است. این سند راهنما و فهرست کمبودهاست؛
پیاده‌سازی یا پذیرش عملیاتیِ موارد باز را ادعا نمی‌کند.

## مبنا و حدود ادعا

- مبنای محلی `origin/main` در این بازبینی `19e95c1` است (به‌روزرسانی
  محدود امنیتیِ وابستگی‌ها در [PR #370](https://github.com/Hordekiller/Iraniyaragh/pull/370)). [وضعیت پروژه](PROJECT_STATUS.md)
  مرجع قابلیت‌های Merge‌شده است؛ سندهای قدیمی sprint/agent assignment برای
  زمان‌بندی فعلی الزام‌آور نیستند. قواعد باقی‌مانده فقط امنیت و صحت داده‌اند:
  [AGENTS.md](../AGENTS.md)، [SECURITY.md](SECURITY.md) و
  [FOUNDATION.md](FOUNDATION.md).
- [PR #346](https://github.com/Hordekiller/Iraniyaragh/pull/346) دریافت کالا در
  Admin، [PR #361](https://github.com/Hordekiller/Iraniyaragh/pull/361) ممیزی،
  [PR #362](https://github.com/Hordekiller/Iraniyaragh/pull/362) ارسال‌ها و
  [PR #365](https://github.com/Hordekiller/Iraniyaragh/pull/365) مشتریان در
  `main` هستند. [PR #367](https://github.com/Hordekiller/Iraniyaragh/pull/367)
  و [PR #368](https://github.com/Hordekiller/Iraniyaragh/pull/368) در زمان
  بازبینی باز بودند و فقط پوشش آزمون‌اند، نه صفحهٔ جدید Merge‌شده.
- شاخهٔ [lane-b/storefront-completion](https://github.com/Hordekiller/Iraniyaragh/tree/lane-b/storefront-completion)
  با commit `9be3539` از همکار در GitHub موجود است، اما PR ندارد و هنگام
  بازبینی ۵۶ commit از `main` عقب بود. تغییر آن ۱۷۹ فایل را دربرمی‌گیرد؛
  ادغام یک‌جای آن در Cart، Checkout، Payment، state و سندها تعارض دارد.
  اطلاعات تماس/نشانیِ ارائه‌شده در `apps/web/src/lib/site-config.ts` و
  اصلاحات UI قابل بررسی و انتخاب‌اند؛ ادعاهای حقوقی، قیمت، موجودی و سیاست
  فروش بدون تأیید کسب‌وکار نباید منتشر شوند. هر جزء مفید باید جداگانه با
  مسیر فعلی و آزمون‌های `main` تطبیق داده شود.
- [PR #371](https://github.com/Hordekiller/Iraniyaragh/pull/371) یک برداشت
  محدود از آن شاخه است: صفحهٔ اصلی با Catalog API موجود، shell با لینک‌های
  واقعی و حذف ادعاهای نمایشی، بدون جایگزین‌کردن منطق فعلی Cart/Checkout/Payment.
  این PR فعلاً **Draft و Merge‌نشده** است؛ اطلاعات تماس عمومیِ برگرفته از
  شاخهٔ همکار پیش از Merge به تأیید صریح مالک نیاز دارد. صفحه‌های Terms/Privacy
  و منطق commerce قدیمی آن شاخه عمداً وارد این برداشت نشده‌اند.

## نسخهٔ واحد فعلی: چه چیزهایی واقعاً به هم وصل شده‌اند؟

| مسیر | مبنای موجود | اثبات باقی‌مانده برای MVP یکپارچه |
| --- | --- | --- |
| Web | مسیرهای صفحهٔ اصلی، دسته، محصول، جستجو، پرفروش‌ها، Cart، Checkout، Payment/Result، حساب و سفارش در [routes.ts](../apps/web/src/lib/routes.ts) و [App.tsx](../apps/web/src/App.tsx) | بازکردن تک‌تک مسیرها با API و دادهٔ پایدار، بدون fixture، روی دسکتاپ و موبایل؛ کنترل حالت خالی/خطا/بازیابی |
| Admin فروش | `/customers`, `/orders`, `/payments`, `/shipments`, `/audit` در [app](../apps/admin/src/app) | بررسی Permission هر عمل، ارتباط سفارش/پرداخت/ارسال با یک رکورد واقعی، و تازه‌شدن UI پس از تغییر |
| Admin کالا/انبار | `/catalog`, `/warehouses`, `/inventory`, `/reservations`, `/transfers`, `/suppliers`, `/purchase-orders` در [navigation.ts](../apps/admin/src/config/navigation.ts) | ثبت کالا/رسانه/قیمت و دریافت خرید در UI؛ تطبیق مانده با ledger و وضعیت نمایشی Web |
| Backend | API و قراردادهای Catalog، Inventory، Cart، Checkout، Payment، Fulfillment، Shipment و Purchasing مطابق [PROJECT_STATUS.md](PROJECT_STATUS.md) | یک سفر مشترک Web → API → Admin با شناسه‌ها و مقادیر قابل تطبیق؛ سبز بودن تست یک شاخه به‌تنهایی کافی نیست |

منوی Admin در [navigation.ts](../apps/admin/src/config/navigation.ts) هنوز
`/stocktakes`، `/reports` و `/access` را `planned` می‌داند؛ در
`apps/admin/src/app` نیز صفحهٔ اجرایی برایشان نیست. نباید آن‌ها را با KPI یا
دکمهٔ ساختگی به‌عنوان قابلیت موجود نمایش داد. Newsletter قبلاً از موفقیت
ساختگی پاک شده ([PR #333](https://github.com/Hordekiller/Iraniyaragh/pull/333))؛
عضویت و ارسال واقعی هنوز قابلیت موجود نیست.

## دادهٔ دمو در UI اولیه؛ «منبع طراحی»، نه حقیقت فروش

در [fixture-data.ts](../apps/web/src/services/catalog/fixture-data.ts) اکنون
۱۵ محصول نمایشی در ۶ دسته تعریف شده‌اند. نام، برند، توضیح، تصویر محلی، قیمت
نمونه، برچسب، امتیاز، تعداد نظر و برچسب وضعیت موجودی در آن **دستی/ثابت**‌اند؛
SKUها با `FIXTURE-` آغاز می‌شوند. اعداد تعداد کالا در دسته‌ها نیز ثابت‌اند.
این‌ها صرفاً مرجع ظاهر اولیه‌اند؛ سند مالکیت تصویر/برند، قیمت معتبر امروز،
موجودی قابل فروش، نظر واقعی یا تخفیف مصوب محسوب نمی‌شوند. فعال‌سازی
`VITE_FIXTURE_CATALOG=true` یا `VITE_FIXTURE_AUTH=true` فقط نمایش محلی/E2E
می‌دهد؛ برای build متصل به API واقعی باید غیرفعال باشند. مسیر انتخاب کلاینت
واقعی/fixture در [CatalogProvider.tsx](../apps/web/src/state/CatalogProvider.tsx)
و [AuthProvider.tsx](../apps/web/src/state/AuthProvider.tsx) مشخص است.
در build تولیدیِ مبنای `main`، import ایستای fixture در Providerها هنوز متن
دادهٔ نمایشی را داخل bundle می‌گذارد، هرچند مسیر runtime پیش‌فرض به HTTP
می‌رود. این با «نمایش واقعی» یکی نیست، اما پیش از انتشار باید با import پویا
و آزمون نبودِ fixture در bundle اصلاح و اثبات شود.

Seed دیتابیس فعلی در [seed.mjs](../apps/api/prisma/seed.mjs) **فقط یک** محصول
و SKU با برچسب دمو، یک انبار/مکان و ماندهٔ افتتاحیهٔ ۵۰ واحد ایجاد می‌کند؛
این همان ۱۵ کالای UI نیست. [seed-policy.mjs](../apps/api/prisma/seed-policy.mjs)
اجرای آن را به توسعه/آزمون و opt-in محدود می‌کند. `AUTH_DEV_CODE` نیز فقط برای
ورود توسعه/آزمون است. این seed را روی دیتابیس فروش اجرا نکنید. کمبود مشخص:
اجرای دوبارهٔ seed فعلی مقدار `InventoryBalance` را به ۵۰ برمی‌گرداند؛ پس پس
از هر گردش موجودی نباید دوباره اجرا شود تا این رفتار با آزمون ledger اصلاح
و پذیرفته شود. این موضوع در فهرست نواقص ثبت است، نه یک توصیه به تغییر مستقیم
ماندهٔ دیتابیس.

برای استفاده از طرح UI به‌عنوان دادهٔ نسخهٔ اول، ابتدا برای هر قلم از طرف
کسب‌وکار این جدول تأیید شود؛ سپس اطلاعات از مسیر Admin/Catalog، قیمت و رسانهٔ
موجود وارد شود، نه با کپی fixture به production:

| فیلد UI اولیه | مرجع لازم پیش از واقعی‌شدن | مسیر درست در سیستم |
| --- | --- | --- |
| نام/برند/دسته/توضیح | فهرست کالای مورد تأیید ایرانی‌یراق، حق استفاده از نام برند | Admin Catalog؛ slug و SKU یکتای واقعی |
| قیمت قبلی/فعلی و تخفیف | قیمت‌نامهٔ تاریخ‌دار، واحد پول ریال، تأیید مسئول فروش | قیمت SKU و سابقهٔ تغییر قیمت؛ هیچ قیمت prototype مستقیم فروخته نشود |
| تصویرهای `/images/*` | تصویر واقعی همان SKU و حق استفاده/مجوز | Admin Product Media و object storage؛ تصویر تزئینی مشترک، عکس محصول واقعی نیست |
| «موجود»، «کم‌موجود»، تعداد دسته | شمارش فیزیکی و مکان انبار | Warehouse/Location + رسید یا تعدیلِ ممیزی‌شده؛ Web از API availability بخواند |
| rating/reviews/badges | دادهٔ قابل اثبات یا تصمیم محتوایی صریح | تا نبود منبع واقعی، ادعای اجتماعی/تخفیف ساختگی نمایش داده نشود |

برای پیش‌نمایش بی‌خطر، دیتابیس جداگانهٔ development/test، برچسب واضح «دمو»
و محصولات seed موجود کافی‌اند؛ اطلاعات prototype می‌تواند صرفاً چک‌لیست ورود
محتوا باشد. ورود واقعی ۱۵ محصول تنها پس از تأیید کسب‌وکار و با رکوردهای Admin
انجام شود. شاخهٔ UI همکار اکنون در GitHub است؛ منبع و مجوز assetها، درستی
اطلاعات تماس، و سازگاری هر صفحه با API فعلی همچنان باید بررسی شود.

## ترتیب کارِ یکپارچه‌سازی، بدون افزودن قابلیت جدید

1. روی آخرین `main`، PRهای باز را تعیین تکلیف و یک commit کاندید ثابت انتخاب
   کنید. شاخهٔ UI همکار باید route-by-route با [App.tsx](../apps/web/src/App.tsx)
   و [Admin app](../apps/admin/src/app) مقایسه شود؛ حفظ نسخهٔ اصلی و ادغام
   اجزای بهتر با تست، نه ساختن دومین Web/Admin موازی. اولویت، حذف هویت و
   وعده‌های ساختگی shell، سپس صفحه‌های discovery سازگار با API فعلی است؛
   منطق قدیمی Cart/Checkout/Payment نباید روی پیاده‌سازی جدید overwrite شود.
2. build عادی Web را بدون fixture flag، با `VITE_API_BASE_URL` محیط آزمون، و
   Admin را با `NEXT_PUBLIC_API_BASE_URL` همان API اجرا کنید. حضور محصول دمو در
   دیتابیس را از API بررسی کنید؛ نمایش عکس/قیمت fixture اثبات اتصال نیست.
   اسکریپت ریشهٔ `pnpm e2e` عمداً Web را در mode `fixture-e2e` می‌سازد
   ([package.json](../package.json)) و به‌تنهایی تست نسخهٔ واقعی نیست.
3. مسیرهای فهرست بالا را با نقش مجاز و نقش بدون مجوز روی دسکتاپ/موبایل باز
   کنید. برای هر action نتیجهٔ ذخیره‌شده، خطا، timeout و نتیجهٔ نامشخص را در
   UI بررسی کنید؛ موفقیت کاذب یا KPI بی‌منبع پذیرفته نیست.
4. در دیتابیس و provider آزمایشی، مسیر Product → Guest Cart → OTP → Checkout →
   Zarinpal sandbox → Order → Reservation/Inventory → Pick → Shipment →
   Tracking را با **یک شناسهٔ سفارش ثابت** ثبت و مقدار/وضعیت هر گام را تطبیق
   کنید. موفقیت sandbox، پذیرش تراکنش واقعی نیست.
5. سپس lint، typecheck، build، unit/integration، migration/drift و مرورگر
   Playwrightِ مرتبط را روی همان commit اجرا و نتیجه را ثبت کنید. خطاهای
   محیطی و خطاهای محصول جدا گزارش شوند. فقط بعد از این، کاندید «MVP یکپارچه
   برای آزمون» نام بگیرد، نه «آمادهٔ فروش».

## نواقص ثبت‌شده در این بازبینی

| کمبود/ریسک | وضعیت و مرجع | اثر بر تصمیم |
| --- | --- | --- |
| صفحات جدید همکار | شاخهٔ `lane-b/storefront-completion` در GitHub موجود، بدون PR، ۵۶ commit عقب و دارای ۱۷۹ فایل تغییر است؛ برداشت محدود Web در PR #371 هنوز Draft است؛ #367/#368 صفحهٔ جدید نیستند | فقط اجزای سازگار را انتخاب و تست کنید؛ merge یک‌جای شاخه خطر بازگرداندن منطق قدیمی فروش را دارد |
| حساب نسیهٔ مشتریان ثابت | [#336](https://github.com/Hordekiller/Iraniyaragh/issues/336) برنامه‌ریزی شده؛ DB/API/Admin موجود نیست. ADR [#338](https://github.com/Hordekiller/Iraniyaragh/issues/338) هم لازم است | سفارش نسیه را نباید با Payment جعلی `PAID` کرد؛ برای فروش نسیهٔ عملیاتی هنوز آماده نیست |
| سفارش حضوری/کارمندی | [#350](https://github.com/Hordekiller/Iraniyaragh/issues/350) هنوز در `main` این بازبینی نیست | فروش حضوریِ بدون Checkout عمومی کامل نیست |
| انبارگردانی، مرجوعی، گزارش، مدیریت نقش | [#347](https://github.com/Hordekiller/Iraniyaragh/issues/347)، [#348](https://github.com/Hordekiller/Iraniyaragh/issues/348)، [#358](https://github.com/Hordekiller/Iraniyaragh/issues/358)، [#359](https://github.com/Hordekiller/Iraniyaragh/issues/359) و nav planned | خارج از قابلیت Merge‌شدهٔ MVP؛ UI یا گزارش ساختگی برایشان مجاز نیست |
| داده/رسانهٔ واقعی فروشگاه | ۱۵ fixture UI در برابر یک محصول seed، بدون عکس اختصاصی تأییدشده؛ مسیر رسانه در [PRODUCT_MEDIA_SPEC.md](PRODUCT_MEDIA_SPEC.md) | برای کاتالوگ واقعی باید SKU، قیمت، تصویر و موجودی از کسب‌وکار اخذ و از مسیر Admin ثبت شود |
| seed دمو | در `seed.mjs` اجرای مجدد balance را بازنویسی می‌کند | پیش از استفادهٔ مکرر در آزمون گردش موجودی باید اصلاح/تست شود؛ هرگز در فروش واقعی اجرا نشود |
| پیمایش کامل UI بدون fixture | `pnpm e2e` ریشه Web را با fixture می‌سازد؛ #252/#258 هنوز بازند | باید آزمون browser با build واقعی و API واقعی جدا ثبت شود |
| دادهٔ fixture در bundle تولیدی | import ایستای Catalog/Auth/Commerce fixture در Providerهای `main` هنوز رشته‌های نمونه را وارد خروجی build می‌کند، حتی اگر runtime flag خاموش باشد | import پویا و check-bundle مستقل لازم است؛ این نکته ادعای فروش واقعی نیست، ولی نباید در انتشار نهایی رها شود |
| SMS.ir و Zarinpal واقعی | adapter/flow موجود، پذیرش handset و تراکنش کنترل‌شده ثبت نشده؛ [#114](https://github.com/Hordekiller/Iraniyaragh/issues/114) | شرط مستقل قبل از دریافت پول مشتری |
| VPS/ذخیره‌سازی/بازگردانی | فقط Compose توسعه در [infrastructure/docker/docker-compose.yml](../infrastructure/docker/docker-compose.yml) دیده شد؛ Dockerfile/proxy/TLS/rollback عملیاتی در این بازبینی پیدا نشد؛ [#136](https://github.com/Hordekiller/Iraniyaragh/issues/136) | طبق دستور مالک، استقرار بعداً؛ الان آمادهٔ deployment واقعی یا فروش اعلام نمی‌شود |
| UAT و انتشار | مسیر fixture-free staging، restore و rollback اثبات نشده؛ [#8](https://github.com/Hordekiller/Iraniyaragh/issues/8) | برچسب `v1.0.0` و فعال‌کردن پرداخت واقعی هنوز زود است |

این فهرست تعهد به ساخت همهٔ قابلیت‌های آینده در همین مرحله نیست؛ مرز روشنِ
آنچه «از کد موجود قابل آزمون است» با آنچه «برای فروش واقعی یا V1 رسمی کم است»
را نشان می‌دهد. مرحلهٔ VPS پس از تصمیم مستقل مالک و برطرف‌شدن حداقل گیت‌های
فروش در [OPERATIONS.md](OPERATIONS.md) و [SECURITY.md](SECURITY.md) انجام شود.
