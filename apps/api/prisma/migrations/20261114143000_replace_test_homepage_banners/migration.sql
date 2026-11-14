-- Replace only the four known temporary storefront banners. Any edited or
-- custom banner set remains untouched, including its images and ordering.
UPDATE "HomepageBannerConfig"
SET "banners" = '[
  {"id":"cabinet-hinges","title":"لولا و یراق کابینت","subtitle":"انتخاب لولای مناسب برای درب کابینت","ctaLabel":"مشاهده لولاها","href":"/search?q=%D9%84%D9%88%D9%84%D8%A7","desktopMediaId":"cabinet-hinge-hero","mobileMediaId":null,"imageAlt":"لولای آرام‌بند روی درب کابینت","enabled":true,"publishAt":null,"unpublishAt":null},
  {"id":"cabinet-drawers","title":"ریل کشو","subtitle":"حرکت نرم و دسترسی آسان به کشوها","ctaLabel":"مشاهده ریل‌ها","href":"/search?q=%D8%B1%DB%8C%D9%84%20%DA%A9%D8%B4%D9%88","desktopMediaId":"cabinet-drawer-hero","mobileMediaId":null,"imageAlt":"ریل فلزی کشوی کابینت","enabled":true,"publishAt":null,"unpublishAt":null},
  {"id":"cabinet-handles","title":"دستگیره کابینت","subtitle":"جزئیاتی که ظاهر کابینت را کامل می‌کنند","ctaLabel":"مشاهده دستگیره‌ها","href":"/search?q=%D8%AF%D8%B3%D8%AA%DA%AF%DB%8C%D8%B1%D9%87","desktopMediaId":"cabinet-handle-hero","mobileMediaId":null,"imageAlt":"دستگیره‌های کابینت چوبی","enabled":true,"publishAt":null,"unpublishAt":null},
  {"id":"cabinet-lifts","title":"جک درب کابینت","subtitle":"راهکار باز شدن راحت درب‌های بالایی","ctaLabel":"مشاهده جک‌ها","href":"/search?q=%D8%AC%DA%A9%20%DA%A9%D8%A7%D8%A8%DB%8C%D9%86%D8%AA","desktopMediaId":"cabinet-lift-hero","mobileMediaId":null,"imageAlt":"جک فلزی درب کابینت چوبی","enabled":true,"publishAt":null,"unpublishAt":null}
]'::jsonb,
    "version" = "version" + 1,
    "updatedAt" = NOW()
WHERE "id" = 'storefront'
  AND jsonb_array_length("banners") = 4
  AND "banners" #>> '{0,id}' = 'test-banner-1'
  AND "banners" #>> '{1,id}' = 'test-banner-2'
  AND "banners" #>> '{2,id}' = 'test-banner-3'
  AND "banners" #>> '{3,id}' = 'test-banner-4'
  AND "banners" #>> '{0,title}' = 'لولا گازور آرام‌بند گاما'
  AND "banners" #>> '{1,title}' = 'لولا گازور کولیتی K63'
  AND "banners" #>> '{2,title}' = 'نمای ترکیبی کولیتی K63'
  AND "banners" #>> '{3,title}' = 'لولا گازور یونی‌هوپر'
  AND "banners" #>> '{0,subtitle}' = 'بنر آزمایشی'
  AND "banners" #>> '{1,subtitle}' = 'بنر آزمایشی'
  AND "banners" #>> '{2,subtitle}' = 'بنر آزمایشی'
  AND "banners" #>> '{3,subtitle}' = 'بنر آزمایشی';
