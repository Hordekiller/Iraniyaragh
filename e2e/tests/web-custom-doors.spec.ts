import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const configuration = {
  technical: null,
  manualApproval: true,
  slots: [
    {
      key: "glass",
      title: "شیشه مورد تأیید",
      materialIds: ["test-glass"],
      required: true,
    },
  ],
  incompatible: [],
  components: [],
  labor: null,
  additional: [],
  taxBps: 0,
  discount: "0",
  minimumTotal: "0",
};
const model = {
  id: "test-model",
  code: "test-model",
  title: "مدل صرفاً آزمون",
  type: "FORMLEX",
  active: true,
  version: 1,
  configuration,
  imageMediaId: null,
  imageUrl: null,
};
const material = {
  id: "test-glass",
  code: "test-glass",
  title: "شیشه صرفاً آزمون",
  category: "GLASS",
  active: true,
  version: 1,
  variantId: null,
  configuration: {
    unit: "M2",
    rate: null,
    validUntil: null,
    specifications: "TEST ONLY",
    color: "",
    thicknessMm: null,
    processingFee: "0",
    stockUnit: null,
  },
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/custom-doors/visibility", (route) =>
    route.fulfill({ json: { data: { enabled: true } } }),
  );
  await page.route("**/api/v1/custom-doors/catalog", (route) =>
    route.fulfill({
      json: {
        data: {
          models: [model],
          materials: [material],
          floatingEnabled: true,
          settingsVersion: 0,
        },
      },
    }),
  );
});
test("floating link clears site navigation and the live product purchase/menu dock", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "سفارش درب فریم‌لس و دکوفیکس" });
  await expect(link).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  if (mobile) {
    const a = await link.boundingBox(),
      b = await page
        .getByRole("navigation", { name: "ناوبری پایین", exact: true })
        .boundingBox();
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y - 5);
  }
  await page
    .getByRole("link", { name: /دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "افزودن به سبد خرید" }),
  ).toBeVisible();
  await expect(link).toBeVisible();
  if (mobile) {
    for (const panel of ["قیمت و خرید", "منوی سایت"]) {
      await page.getByRole("button", { name: panel, exact: true }).click();
      await expect
        .poll(async () => {
          const a = await link.boundingBox(),
            b = await page.locator("#product-purchase").boundingBox();
          return a!.y + a!.height <= b!.y - 5;
        })
        .toBe(true);
    }
  }
  await page.screenshot({
    path: testInfo.outputPath("product-floating-clearance.png"),
  });
  await link.click();
  await expect(
    page.getByRole("heading", { name: "سفارش آنلاین درب فریم‌لس و دکوفیکس" }),
  ).toBeVisible();
  await expect(link).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("configures several doors in Persian, reviews unpriced terms and remains accessible", async ({
  page,
}, testInfo) => {
  await page.route("**/api/v1/custom-doors/quote-preview", async (route) => {
    const body = route.request().postDataJSON() as {
      items: { widthMm: number; heightMm: number; quantity: number }[];
    };
    expect(body.items[0]).toMatchObject({
      widthMm: 500,
      heightMm: 1000,
      quantity: 2,
      manufacturing: { profileColor: "BRONZE", handleSide: "LEFT", hingeSide: "RIGHT", drillingMode: "CUSTOM", holes: [120, 350, 650, 880].map(distanceMm => ({ distanceMm, reference: "TOP" })) },
    });
    await route.fulfill({
      json: {
        data: {
          quote: {
            currency: "IRR",
            lines: body.items.map((item, index) => ({
              item: index,
              title: model.title,
              ...item,
              unitTotal: null,
              total: null,
              parts: [],
              model,
              materials: [material],
            })),
            reasons: ["این داده صرفاً آزمون است؛ تعرفه تعیین نشده"],
            calculatedTotal: null,
            total: null,
            adjustments: [],
            approvalReason: null,
          },
        },
      },
    });
  });
  await page.goto("/custom-doors");
  await page.getByRole("button", { name: /مدل صرفاً آزمون/ }).click();
  await page.getByLabel("شیشه مورد تأیید").selectOption("test-glass");
  await page.getByLabel("عرض (میلی‌متر)", { exact: true }).fill("۵۰۰");
  await page.getByLabel("ارتفاع (میلی‌متر)", { exact: true }).fill("۱۰۰۰");
  await page.getByLabel("تعداد", { exact: true }).fill("۲");
  await page.getByRole("combobox", { name: "رنگ پروفیل", exact: true }).selectOption("BRONZE");
  await page.getByRole("combobox", { name: "سمت دستگیره", exact: true }).selectOption("LEFT");
  await page.getByRole("combobox", { name: "محل گازور / لولا", exact: true }).selectOption("RIGHT");
  await page.getByRole("combobox", { name: "حالت سوراخ‌کاری", exact: true }).selectOption("CUSTOM");
  const positions = ["۱۲", "۳۵", "۶۵", "۸۸"];
  for (let index = 0; index < positions.length; index++) {
    await page.getByLabel(`فاصلهٔ سوراخ ${(index + 1).toLocaleString("fa-IR")} (سانت)`, { exact: true }).fill(positions[index]);
  }
  await expect(page.getByText("حداکثر ۱۰۰ سانت (بیشتر از ارتفاع درب مجاز نیست)")).toHaveCount(4);
  await page.getByLabel("فاصلهٔ سوراخ ۱ (سانت)", { exact: true }).fill("۱۰۱");
  await page.getByRole("button", { name: "افزودن این درب" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("حداکثر برابر ارتفاع درب");
  await page.getByLabel("فاصلهٔ سوراخ ۱ (سانت)", { exact: true }).fill("۱۲");
  await page.screenshot({ path: testInfo.outputPath("manufacturing-fields.png"), fullPage: true });
  await page.getByRole("button", { name: "افزودن این درب" }).click();
  await page.getByRole("button", { name: "تکثیر درب 1" }).click();
  await expect(page.getByText("مجموع تعداد: ۴")).toBeVisible();
  await page.getByRole("button", { name: "محاسبه و بررسی سفارش" }).click();
  await expect(
    page.getByText("این داده صرفاً آزمون است؛ تعرفه تعیین نشده"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "پرداخت کامل سفارش" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("configurator-review.png"),
    fullPage: true,
  });
});
