# شواهد تحویل سفارش ساخت درب

تاریخ بررسی نهایی: ۲۰۲۶-۱۱-۰۳. شاخه مبنا `main`؛ کد در درخواست تغییرات [#497](https://github.com/Hordekiller/Iraniyaragh/pull/497)
ثبت شده است؛ شواهد انتشار VPS جداگانه در ادامه ثبت می‌شوند.

## نتیجه قابلیت‌ها

| معیار پذیرش | شواهد واقعی |
| --- | --- |
| دکمه شناور و عدم تداخل موبایل | `DoorOrderFloatingLink.tsx`، اندازه‌گیری nav/dock، و تست Playwright هندسی در دسکتاپ، Pixel 7 و عرض ۳۷۵ |
| صفحه اختصاصی و فرم چندمرحله‌ای | `CustomDoorsPage.tsx`، چند ردیف، ویرایش/تکثیر/حذف، اعداد فارسی، حفظ فرم و retry پایدار |
| داده واقعی قابل مدیریت | `DoorCatalogPanel.tsx` و `door-catalog.service.ts`؛ کاتالوگ اولیه خالی، انتشار اختیاری، نسخه و تاریخچه ثبت‌کننده |
| موتور ترکیبی | `door-pricing.ts` و تست محاسبات bigint / نسبت دقیق، پرت، حداقل، اجرت، مالیات، تخفیف و چند مدل |
| بررسی و تأیید دستی | `approveQuote`، قیمت قطعی هر ردیف و هزینه جانبی با دلیل، تطبیق جمع‌ها و Quote append-only |
| بیعانه و تسویه | تغییرات سرویس آغاز پرداخت و verifier موجود؛ Mock Provider با PostgreSQL واقعی |
| فاکتور و گزارش موجود | صدور واقعی `InvoiceDocument` در DB تست با همان شماره‌گذاری و قیود؛ خط خدمت بدون SKU مصنوعی؛ گزارش متصل به Order/Payment |
| پیگیری مشتری و مجوزها | `AccountCustomDoorsPage.tsx`، تست IDOR سرویس و کنترل HTTP مشتری/مدیر و مجوزهای ترکیبی |
| تولید و انبار | state machine، تأیید فنی، BOM Snapshot، رزرو مقدار واقعی، آزادسازی و یک مصرف immutable |
| اعلان و فایل | همان outbox/SMS worker با Provider مصنوعی؛ اسکن، checksum، MIME و دسترسی خصوصی فایل |
| migration و داده قبلی | دو migration افزایشی روی PostgreSQL محلی؛ قیود SQL مالی، مشخصات تأییدشده و هویت فاکتور |
| خروجی قابل ساخت | build موفق API، web و admin با اسکریپت‌های واقعی پروژه |

## اجرای واقعی تست و کنترل کیفیت

| کنترل | دستور / محیط | نتیجه |
| --- | --- | --- |
| Unit / HTTP / OpenAPI API | Vitest از `pnpm test` | ۱۹۰۳ تست موفق |
| Unit پنل مدیریت | Vitest از `pnpm test` | ۹۹۴ تست موفق |
| Unit سایت | Vitest از `pnpm test` | ۴۷۹ تست موفق |
| Node / Prisma / RBAC | `node --test prisma/*.test.mjs` با `RBAC_BASELINE_INTEGRATION=true` و DB تست جدا | ۵۹ تست موفق؛ بدون skip در اجرای opt-in |
| Integration کل API | `pnpm --filter @iranyaragh/api test:integration`، PostgreSQL واقعی UTC و Redis جدا | ۴۹ فایل و ۵۰۵ تست موفق |
| E2E و a11y جدید | `playwright.custom-doors.config.ts` | ۶ تست موفق؛ سه اندازه، عدم overflow و صفر violation در بررسی axe صفحه پیکربندی |
| قراردادها | typecheck قراردادهای مشترک + تولید OpenAPI + تست drift/ساختار | موفق |
| Lint | `pnpm lint`، شامل کنترل دارایی‌های محلی | موفق |
| Typecheck | `pnpm typecheck` روی هر ۵ package | موفق |
| Build | `pnpm build --concurrency=1` | هر سه برنامه موفق |
| Prisma | `prisma validate` و `prisma migrate deploy` روی DB تست | موفق؛ هر دو migration جدید اعمال شدند |
| بازیابی backup آزمایشی | pg_dump / pg_restore روی دو DB مصنوعی محلی | موفق؛ ۱۵ Quote و جمع total برابر ۴۶۸۸۱۲ ریال در منبع و restore |
| تغییرات | `git diff --check` | بدون خطای whitespace |

اجرای نهایی Unitها از دستور واقعی ریشه با محدودیت منابع انجام شد:
`VITEST_MAX_WORKERS=4 pnpm test --concurrency=1`. هیچ تستی حذف یا غیرفعال نشده است.
ده تست RBAC که در اجرای معمول بدون DB طبق سیاست قبلی مخزن skip می‌شوند، جداگانه
با flag رسمی و دیتابیس `_test` اجرا شدند. تست‌های integration به PostgreSQL/Redis
موقت محلی متصل بودند؛ هیچ فایل production یا export مشتری واقعی استفاده نشد.

داده‌های Playwright در این suite صریحاً «صرفاً آزمون» هستند و API کاتالوگ در مرورگر
intercept می‌شود. اثبات واقعی تراکنش‌های DB، پرداخت Mock، فایل و تولید در suite
integration انجام شده است. کل suite قدیمی E2E که به nginx/Docker و هویت عملیاتی
جدا نیاز دارد، در این مأموریت اجرا نشده؛ نتیجه آن موفق اعلام نمی‌شود.

چند اجرای اولیه با خطای محیط/fixture یا ناسازگاری قابل اصلاح روبه‌رو شدند؛ موارد
رفع و سپس کنترل مربوط دوباره اجرا شد: تزریق وابستگی صریح، artifact جدید OpenAPI،
انتظار ناوبری پس از افزودن بخش درب، حفظ رفتار expiry انبار عمومی، پاک‌سازی fixture
در DB تست، timezone=UTC دیتابیس تست و timeout انبارگردانی تحت بار هم‌زمان. برای
سبز شدن تست، منطق مالی یا کنترل دسترسی ضعیف نشد و کد نامرتبط انبارگردانی/گزارش
تغییر نکرد. اجرای کامل integration نهایی موفق بود.

کنترل پوشش اجباری CI نیز با `CI=true` اجرا شد: API شامل ۱۹۰۳ تست با پوشش
توابع ۷۰٫۱۳٪ و شاخه‌ها ۶۱٫۱۳٪؛ سایت شامل ۴۷۹ تست با پوشش شاخه‌ها ۷۶٫۶۳٪.
آستانه‌های موجود مخزن تغییر نکرده‌اند. تست‌های اضافه، retry ثابت پس از reload،
پاسخ نامطمئن، رد قطعی ثبت، نسخه تعرفه، مجوزهای ترکیبی و کنترل مالکیت پیش از
آغاز پرداخت را پوشش می‌دهند.

## وابستگی‌های داده و پذیرش واقعی

- مدیر باید مدل‌ها، گزینه‌های سازگار، قواعد ابعاد/برش و تلرانس، اجرت، تعرفه،
  اعتبار نرخ، مالیات و سیاست بیعانه معتبر را ثبت کند. هیچ داده فنی/قیمت فرضی
  به مشتری منتشر نمی‌شود.
- تصاویر واقعی از رسانه‌های READY موجود انتخاب و بارگذاری می‌شوند؛ تا آن زمان
  جای‌نگهدار صریح نمایش داده می‌شود.
- شروع تولید قطعات متصل به انبار به برنامه مصرف واقعی، محل موجودی و تأیید فنی
  نیاز دارد. چیدمان بهینه خودکار برش ادعا نشده است.
- لغو عادی پس از شروع تولید مسدود است. اصلاح مالی سفارش تسویه‌شده/سند صادرشده،
  مسیر بازنویسی Quote نیست؛ اسناد و پرداخت‌های قبلی حفظ می‌شوند.
- پذیرش زرین‌پال واقعی، دریافت پیامک واقعی، ذخیره‌سازی و اسکن production هنوز
  باید با حساب‌ها و زیرساخت واقعی در آزمون کنترل‌شده پروژه انجام شوند.
- restore انجام‌شده فقط مربوط به داده مصنوعی محلی است؛ backup و restore واقعی
  production پیش‌شرط مستقل انتشار باقی می‌ماند.

## وضعیت انتشار

کد، قراردادها، migrationها، UI و build برای بازبینی و انتشار کنترل‌شده آماده‌اند.
فعالسازی فروش واقعی مشروط به ورود داده معتبر و عبور از پذیرش عملیاتی زیرساخت
است. روی VPS production دستور migration، پرداخت واقعی یا deploy اجرا نشده است.
راهنمای ترتیب انتشار و rollback افزایشی در `CUSTOM_DOOR_ORDERS.md` آمده است.

## فهرست فایل‌های تغییرکرده و ایجادشده

- `apps/admin/src/app/(dashboard)/custom-doors/deposits/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/glass/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/hardware/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/labor/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/models/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/orders/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/orders/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/production/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/profiles/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/reports/page.tsx`
- `apps/admin/src/app/(dashboard)/custom-doors/rules/page.tsx`
- `apps/admin/src/components/custom-doors/DoorCatalogPanel.tsx`
- `apps/admin/src/components/custom-doors/DoorOrdersPanel.tsx`
- `apps/admin/src/components/invoices/InvoiceDraftPage.tsx`
- `apps/admin/src/components/layout/__tests__/GlobalSearch.test.tsx`
- `apps/admin/src/config/navigation.ts`
- `apps/admin/src/lib/custom-doors/api.ts`
- `apps/api/openapi.json`
- `apps/api/prisma/migrations/20261103120000_custom_door_orders/migration.sql`
- `apps/api/prisma/migrations/20261103140000_custom_door_invoice_identity_guard/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/auth/rate-limit.config.ts`
- `apps/api/src/modules/custom-door-orders/custom-door-orders.module.ts`
- `apps/api/src/modules/custom-door-orders/door-catalog.service.ts`
- `apps/api/src/modules/custom-door-orders/door-files.service.ts`
- `apps/api/src/modules/custom-door-orders/door-orders.integration-spec.ts`
- `apps/api/src/modules/custom-door-orders/door-orders.service.ts`
- `apps/api/src/modules/custom-door-orders/door-payment-settlement.ts`
- `apps/api/src/modules/custom-door-orders/door-pricing.spec.ts`
- `apps/api/src/modules/custom-door-orders/door-pricing.ts`
- `apps/api/src/modules/custom-door-orders/door-state.ts`
- `apps/api/src/modules/custom-door-orders/door.controller.ts`
- `apps/api/src/modules/custom-door-orders/door.dto.ts`
- `apps/api/src/modules/custom-door-orders/door.http.spec.ts`
- `apps/api/src/modules/custom-door-orders/door.openapi.ts`
- `apps/api/src/modules/custom-door-orders/door.test-fixtures.ts`
- `apps/api/src/modules/inventory/inventory.service.spec.ts`
- `apps/api/src/modules/inventory/inventory.service.ts`
- `apps/api/src/modules/invoices/invoice-document.service.ts`
- `apps/api/src/modules/invoices/invoice-draft.integration-spec.ts`
- `apps/api/src/modules/invoices/invoice-draft.openapi.ts`
- `apps/api/src/modules/invoices/invoice-draft.service.ts`
- `apps/api/src/modules/invoices/invoices.module.ts`
- `apps/api/src/modules/media/media.module.ts`
- `apps/api/src/modules/notifications/customer-sms-delivery.service.ts`
- `apps/api/src/modules/notifications/sms-provider.ts`
- `apps/api/src/modules/notifications/sms-template-settings.service.ts`
- `apps/api/src/modules/orders/order-command.service.spec.ts`
- `apps/api/src/modules/orders/order-command.service.ts`
- `apps/api/src/modules/orders/order-read.service.ts`
- `apps/api/src/modules/outbox/outbox-consumer.service.ts`
- `apps/api/src/modules/payments/payment-initiation.service.spec.ts`
- `apps/api/src/modules/payments/payment-initiation.service.ts`
- `apps/api/src/modules/payments/payment-verification.openapi.ts`
- `apps/api/src/modules/payments/payment-verification.service.ts`
- `apps/api/src/modules/payments/payments.module.ts`
- `apps/api/src/modules/payments/zarinpal-callback.controller.ts`
- `apps/api/src/swagger.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/app/custom-doors/page.tsx`
- `apps/web/src/components/account/AccountNavigation.tsx`
- `apps/web/src/components/custom-doors/DoorOrderFloatingLink.tsx`
- `apps/web/src/components/custom-doors/DoorSummary.tsx`
- `apps/web/src/components/custom-doors/custom-doors.test.tsx`
- `apps/web/src/components/layout/AppLayout.tsx`
- `apps/web/src/components/layout/MobileBottomNav.tsx`
- `apps/web/src/components/next/PrivateRoutes.tsx`
- `apps/web/src/index.css`
- `apps/web/src/lib/auth/request.ts`
- `apps/web/src/lib/private-journey-path.ts`
- `apps/web/src/lib/routes.ts`
- `apps/web/src/services/custom-doors/api.ts`
- `apps/web/src/views/AccountCustomDoorsPage.tsx`
- `apps/web/src/views/CustomDoorsPage.tsx`
- `docs/CUSTOM_DOOR_ORDERS.md`
- `docs/CUSTOM_DOOR_VALIDATION.md`
- `docs/README.md`
- `e2e/playwright.custom-doors.config.ts`
- `e2e/tests/web-custom-doors.spec.ts`
- `packages/contracts/src/custom-doors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/invoice-documents.ts`
- `packages/contracts/src/invoice-drafts.ts`
- `packages/contracts/src/payments.ts`
