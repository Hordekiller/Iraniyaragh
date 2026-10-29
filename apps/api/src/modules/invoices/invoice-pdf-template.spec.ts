import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CustomerInvoice, Money } from "@iranyaragh/contracts";
import { describe, expect, it } from "vitest";
import {
  buildInvoicePdfHtml,
  INVOICE_PDF_ASSETS,
  INVOICE_PDF_LIMITS,
  InvoicePdfInputError,
} from "./invoice-pdf-template";

const assets = {
  fontWoff2: readFileSync(
    resolve(__dirname, "../../../../web/public/fonts/Vazirmatn[wght].woff2"),
  ),
  wordmarkPng: readFileSync(
    resolve(__dirname, "../../../../web/public/brand/wordmark-print.png"),
  ),
};
const money = (amount: string): Money => ({ amount, currency: "IRR" });
function invoice(): CustomerInvoice {
  return {
    id: "synthetic-pdf-document",
    orderId: "synthetic-pdf-order",
    number: "IRY-2026-000001",
    issuedAt: "2026-10-15T00:00:00.000Z",
    seller: {
      name: "فروشندهٔ آزمایشی",
      address: "نشانی ساختگی فروشنده",
      contact: "تماس عمومی آزمایشی",
    },
    buyerLabel: "خریدار ساختگی آزمون",
    address: {
      provinceCode: "THR",
      city: "تهران",
      address: "نشانی ساختگی آزمون",
      postalCode: "1234567890",
      recipient: "گیرندهٔ ساختگی",
      mobile: "test-destination",
    },
    shippingTitle: "تحویل حضوری",
    taxPolicy: {
      treatment: "INCLUSIVE",
      rateBps: 0,
      exemptionReason: null,
      shippingTaxable: false,
    },
    quote: {
      subtotal: money("9007199254740993"),
      discount: money("0"),
      shipping: money("0"),
      netAmount: money("9007199254740993"),
      tax: money("0"),
      total: money("9007199254740993"),
    },
    lines: [
      {
        sku: "SYNTHETIC-1",
        title: "لولای آرام‌بند آزمایشی",
        quantity: 1,
        unitPrice: money("9007199254740993"),
        discount: money("0"),
        netAmount: money("9007199254740993"),
        tax: money("0"),
        total: money("9007199254740993"),
      },
    ],
  };
}

describe("Private invoice PDF fixed template boundary", () => {
  it("uses the corrected display brand for new PDFs and preserves the legacy render revision", () => {
    const current = buildInvoicePdfHtml(invoice(), assets);
    expect(current.templateRevision).toBe("store-invoice-a4-v2");
    expect(current.html).toContain("فاکتور فروشگاهی ایرانی یراق");
    const legacy = buildInvoicePdfHtml(invoice(), assets, "store-invoice-a4-v1");
    expect(legacy.templateRevision).toBe("store-invoice-a4-v1");
    expect(legacy.html).toContain("فاکتور فروشگاهی ایران یراق");
    expect(() => buildInvoicePdfHtml(invoice(), assets, "unknown-template")).toThrow(InvoicePdfInputError);
  });
  it("preserves stored IRR and document number without rounding, recalculation or input mutation", () => {
    const input = invoice(),
      before = structuredClone(input);
    const result = buildInvoicePdfHtml(input, assets);
    expect(input).toEqual(before);
    expect(result.html).toContain("9,007,199,254,740,993");
    expect(result.html).toContain("IRY-2026-000001");
    expect(result.html).toContain("ریال");
    expect(result.html).toContain("رسید پرداخت نیست");
    expect(result.html).toContain("صورتحساب سامانهٔ مؤدیان نیست");
    expect(result.htmlSha256).toBe(
      createHash("sha256").update(result.html).digest("hex"),
    );
    expect(buildInvoicePdfHtml(input, assets)).toEqual(result);
  });
  it("pins both approved local assets and embeds all image/font bytes without a CDN or user-controlled URL", () => {
    const result = buildInvoicePdfHtml(invoice(), assets);
    expect(result).toMatchObject(INVOICE_PDF_ASSETS);
    expect(result.html).toContain(
      `data:font/woff2;base64,${assets.fontWoff2.toString("base64")}`,
    );
    expect(result.html).toContain(
      `data:image/png;base64,${assets.wordmarkPng.toString("base64")}`,
    );
    expect(result.html).toContain("default-src 'none'");
    expect(result.html).not.toMatch(
      /(?:src|href)=["'](?:https?:|file:|javascript:)/iu,
    );
    expect(result.html).toContain("@page{size:A4");
    expect(result.html).toContain("thead{display:table-header-group}");
  });
  it.each(["fontWoff2", "wordmarkPng"] as const)(
    "fails closed on substituted or oversized %s",
    (field) => {
      const corrupted = { ...assets, [field]: Buffer.from(assets[field]) };
      corrupted[field][200] ^= 1;
      expect(() => buildInvoicePdfHtml(invoice(), corrupted)).toThrow(
        InvoicePdfInputError,
      );
      expect(() =>
        buildInvoicePdfHtml(invoice(), {
          ...assets,
          [field]: Buffer.alloc(1024 * 1024),
        }),
      ).toThrow(InvoicePdfInputError);
    },
  );
  it.each([
    '<script>alert("private")</script>',
    '<SCRIPT>alert("private")</SCRIPT>',
    '<img src="https://external.invalid/" onerror="alert(1)">',
    '<ImG SrC="https://external.invalid/" OnErRoR="alert(1)">',
    '</style><iframe src="file:///etc/passwd"></iframe>',
    '</STYLE><IFRAME SRC="file:///etc/passwd"></IFRAME>',
    '<a href="javascript:alert(1)">link</a>',
  ])(
    "prints hostile text literally without executable markup: %s",
    (payload) => {
      const input = invoice();
      input.lines[0].title = payload;
      input.buyerLabel = payload;
      const { html } = buildInvoicePdfHtml(input, assets);
      expect(html).not.toContain(payload);
      expect(html).not.toMatch(/<script|<iframe|<a\s|<[^>]*\sonerror=/iu);
      expect(html).toContain("&lt;");
    },
  );
  it("never serializes extra staff notes, identifiers, raw audit or provider fields", () => {
    const input = invoice();
    Object.assign(input, {
      note: "PRIVATE_STAFF_NOTE",
      policyVersion: "PRIVATE_POLICY",
      providerSecret: "PRIVATE_PROVIDER",
    });
    Object.assign(input.lines[0], {
      orderItemId: "PRIVATE_ITEM",
      audit: "PRIVATE_AUDIT",
    });
    const { html } = buildInvoicePdfHtml(input, assets);
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain(input.id);
    expect(html).not.toContain(input.orderId);
  });
  it.each([
    "-1",
    "1.2",
    "1e3",
    "01",
    "9223372036854775808",
    "9007199254740993.0",
  ])("rejects noncanonical/out-of-range IRR %s", (value) => {
    const input = invoice();
    input.quote.total.amount = value;
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
  });
  it("accepts signed-64-bit maximum exactly and rejects foreign currency or numeric money", () => {
    const input = invoice();
    input.lines[0].total = money("9223372036854775807");
    expect(buildInvoicePdfHtml(input, assets).html).toContain(
      "9,223,372,036,854,775,807",
    );
    input.quote.total.currency = "USD" as "IRR";
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
    input.quote.total = { amount: 123, currency: "IRR" } as unknown as Money;
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
  });
  it("renders stored tax treatment/rate explicitly without assuming a live tax policy", () => {
    const input = invoice();
    input.taxPolicy = {
      treatment: "EXCLUSIVE",
      rateBps: 125,
      exemptionReason: null,
      shippingTaxable: true,
    };
    expect(buildInvoicePdfHtml(input, assets).html).toContain("1.25%");
    input.taxPolicy = {
      treatment: "EXEMPT",
      rateBps: 0,
      exemptionReason: "دلیل معافیت ساختگی",
      shippingTaxable: false,
    };
    expect(buildInvoicePdfHtml(input, assets).html).toContain(
      "دلیل معافیت ساختگی",
    );
    input.taxPolicy.rateBps = 1;
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
  });
  it("bounds rows, quantities, plain text and encoded input; never silently truncates an invoice", () => {
    const input = invoice();
    input.lines = Array.from({ length: INVOICE_PDF_LIMITS.lines }, (_, i) => ({
      ...input.lines[0],
      sku: `SYNTHETIC-${i}`,
    }));
    expect(
      Buffer.byteLength(buildInvoicePdfHtml(input, assets).html),
    ).toBeLessThan(INVOICE_PDF_LIMITS.htmlBytes);
    input.lines.push(input.lines[0]);
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
    input.lines = [];
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
    for (const quantity of [0, -1, 1.5, 1001, Number.NaN]) {
      const item = invoice();
      item.lines[0].quantity = quantity;
      expect(() => buildInvoicePdfHtml(item, assets)).toThrow(
        InvoicePdfInputError,
      );
    }
    for (const title of [
      "x".repeat(501),
      "unsafe\u202econtrol",
      "unsafe\ncontrol",
    ]) {
      const item = invoice();
      item.lines[0].title = title;
      expect(() => buildInvoicePdfHtml(item, assets)).toThrow(
        InvoicePdfInputError,
      );
    }
    Object.assign(input, {
      unnecessary: "x".repeat(INVOICE_PDF_LIMITS.inputBytes),
    });
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
  });
  it("returns one sanitized error for malformed persistence without reflecting sensitive content", () => {
    for (const input of [
      null,
      {},
      { seller: "PRIVATE_INPUT", lines: [{}] },
      { ...invoice(), issuedAt: "invalid-PRIVATE_INPUT" },
    ]) {
      try {
        buildInvoicePdfHtml(input as CustomerInvoice, assets);
        expect.fail("must fail closed");
      } catch (error) {
        expect(error).toBeInstanceOf(InvoicePdfInputError);
        expect((error as Error).message).not.toContain("PRIVATE_INPUT");
      }
    }
  });
  it("rejects HTML expansion beyond its independent budget rather than truncating escaped text", () => {
    const input = invoice();
    input.lines = Array.from({ length: 100 }, (_, i) => ({
      ...input.lines[0],
      sku: `SYNTHETIC-${i}`,
      title: "'".repeat(500),
    }));
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(
      INVOICE_PDF_LIMITS.inputBytes,
    );
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
  });
  it("rejects invalid numbering/date or contradictory tax policy before producing printable bytes", () => {
    for (const number of [
      "IRY-2026-1",
      'IRY-2026-000001";color:red',
      "<style>",
    ]) {
      expect(() =>
        buildInvoicePdfHtml({ ...invoice(), number }, assets),
      ).toThrow(InvoicePdfInputError);
    }
    expect(() =>
      buildInvoicePdfHtml(
        { ...invoice(), issuedAt: "2026-99-99T00:00:00Z" },
        assets,
      ),
    ).toThrow(InvoicePdfInputError);
    const input = invoice();
    input.taxPolicy.exemptionReason = "Unexpected exemption";
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
    input.taxPolicy.exemptionReason = null;
    input.taxPolicy.rateBps = 10001;
    expect(() => buildInvoicePdfHtml(input, assets)).toThrow(
      InvoicePdfInputError,
    );
  });
});
