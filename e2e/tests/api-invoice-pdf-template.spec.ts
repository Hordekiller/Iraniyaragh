import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildInvoicePdfHtml,
  INVOICE_PDF_LIMITS,
} from "../../apps/api/src/modules/invoices/invoice-pdf-template";

// Renderer-template acceptance only: synthetic data never enters a sales DB.
// Durable jobs, private downloads and the final isolated worker have separate gates.
test("issued invoice PDF template embeds approved local assets, escapes text and prints bounded Persian A4 pages", async ({
  browser,
}, testInfo) => {
  const money = (amount: string) => ({ amount, currency: "IRR" as const });
  const lines = Array.from({ length: 70 }, (_, index) => {
    const value = index === 0 ? "9007199254740993" : "1";
    return {
      sku: `SYNTHETIC-${index + 1}`,
      title:
        index === 0
          ? '<img src="https://external.invalid/private" onerror="alert(1)">'
          : "لولای آرام‌بند آزمایشی — کالای ساختگی برای آزمون قلم و چاپ",
      quantity: 1,
      unitPrice: money(value),
      discount: money("0"),
      netAmount: money(value),
      tax: money("0"),
      total: money(value),
    };
  });
  const total = money((9007199254740993n + 69n).toString());
  const html = buildInvoicePdfHtml(
    {
      id: "synthetic-only-document",
      orderId: "synthetic-only-order",
      number: "IRY-2026-000001",
      issuedAt: "2026-10-15T00:00:00.000Z",
      seller: {
        name: "فروشندهٔ آزمایشی؛ سند ساختگی",
        address: "نشانی ساختگی برای آزمون چاپ",
        contact: "اطلاعات تماس آزمایشی",
      },
      buyerLabel: "خریدار ساختگی آزمون PDF",
      address: {
        provinceCode: "THR",
        city: "تهران",
        address: "این نشانی و تمام اقلام صرفاً دادهٔ آزمون هستند",
        postalCode: "1234567890",
        recipient: "گیرندهٔ ساختگی",
        mobile: "test-destination",
      },
      shippingTitle: "تحویل حضوری آزمایشی",
      taxPolicy: {
        treatment: "INCLUSIVE",
        rateBps: 0,
        exemptionReason: null,
        shippingTaxable: false,
      },
      quote: {
        subtotal: total,
        discount: money("0"),
        shipping: money("0"),
        netAmount: total,
        tax: money("0"),
        total,
      },
      lines,
    },
    {
      fontWoff2: readFileSync(
        resolve(
          __dirname,
          "../..",
          "apps/web/public/fonts/Vazirmatn[wght].woff2",
        ),
      ),
      wordmarkPng: readFileSync(
        resolve(__dirname, "../..", "apps/web/public/brand/wordmark-print.png"),
      ),
    },
  ).html;
  const context = await browser.newContext({
    javaScriptEnabled: false,
    serviceWorkers: "block",
    viewport: { width: 718, height: 1000 },
  });
  let externalRequests = 0;
  await context.route("**/*", (route) => {
    externalRequests += 1;
    return route.abort();
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 10000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.locator("script,iframe,embed,object,a,[onerror]"),
    ).toHaveCount(0);
    await expect(page.locator("img")).toHaveCount(1);
    await expect(page.locator(".line")).toHaveCount(70);
    await expect(page.locator(".item").first()).toHaveText(
      /<img src="https:\/\/external.invalid\/private" onerror="alert\(1\)">/u,
    );
    expect(
      await page.evaluate(() =>
        Array.from(document.fonts).some(
          (font) => font.family === "InvoiceLocal" && font.status === "loaded",
        ),
      ),
    ).toBe(true);
    expect(
      await page
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBe(1086);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.locator(".amount").evaluateAll((values) =>
        values.every((value) => {
          const cell = value.closest("td,dd")!;
          const a = value.getBoundingClientRect(),
            b = cell.getBoundingClientRect();
          return a.left >= b.left && a.right <= b.right;
        }),
      ),
    ).toBe(true);
    await expect(page.locator(".totals")).toContainText(
      "9,007,199,254,741,062",
    );
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10000);
    expect(pdf.length).toBeLessThanOrEqual(INVOICE_PDF_LIMITS.pdfBytes);
    expect(
      (pdf.toString("latin1").match(/\/Type\s*\/Page\b/gu) ?? []).length,
    ).toBeGreaterThan(1);
    expect(externalRequests).toBe(0);
    const pdfPath = testInfo.outputPath(
      "synthetic-persian-invoice-template.pdf",
    );
    writeFileSync(pdfPath, pdf);
    await testInfo.attach("synthetic-persian-invoice-template.pdf", {
      path: pdfPath,
      contentType: "application/pdf",
    });
  } finally {
    await context.close();
  }
});
