import { createHash } from "node:crypto";
import type { CustomerInvoice, Money } from "@iranyaragh/contracts";

// Internal rendering boundary only. Authorization, durable jobs and private
// artifact downloads must be implemented before exposing a PDF endpoint.
export const INVOICE_PDF_TEMPLATE_REVISION = "store-invoice-a4-v2";
export const INVOICE_PDF_LIMITS = Object.freeze({
  lines: 100,
  inputBytes: 128 * 1024,
  htmlBytes: 1024 * 1024,
  pdfBytes: 2 * 1024 * 1024,
});
export const INVOICE_PDF_ASSETS = Object.freeze({
  fontSha256:
    "4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92",
  brandSha256:
    "c58b4bf6c4dc2b8fc848ba66a5f17e04ec297ae03f7a3a8bfae99df0585b0e5c",
});
export class InvoicePdfInputError extends Error {
  readonly code = "INVOICE_PDF_INPUT_INVALID";
  constructor() {
    super("Invoice PDF input or local assets are invalid.");
  }
}
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function invalid(): never {
  throw new InvoicePdfInputError();
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
function text(value: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
    invalid();
  // Literal markup/URLs stay escaped text; never interpolate an HTML attribute,
  // stylesheet, filename, link or executable document supplied by a customer.
  return escape(value);
}
function amount(value: Money): string {
  if (
    !value ||
    value.currency !== "IRR" ||
    typeof value.amount !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/u.test(value.amount) ||
    BigInt(value.amount) > 9223372036854775807n
  )
    invalid();
  return `<bdi dir="ltr" class="amount">${value.amount.replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}</bdi>`;
}
function taxText(policy: CustomerInvoice["taxPolicy"]): string {
  if (
    !policy ||
    !["EXEMPT", "INCLUSIVE", "EXCLUSIVE"].includes(policy.treatment) ||
    !Number.isInteger(policy.rateBps) ||
    policy.rateBps < 0 ||
    policy.rateBps > 10000 ||
    typeof policy.shippingTaxable !== "boolean"
  )
    invalid();
  if (policy.treatment === "EXEMPT") {
    if (policy.rateBps !== 0 || policy.exemptionReason === null) invalid();
    return `معاف از مالیات: ${text(policy.exemptionReason, 500)}`;
  }
  if (policy.exemptionReason !== null) invalid();
  const rate = `${Math.trunc(policy.rateBps / 100)}.${String(policy.rateBps % 100).padStart(2, "0")}`;
  return `${policy.treatment === "INCLUSIVE" ? "مالیات در مبلغ منظور شده است" : "مالیات جدا از مبلغ پایه"}؛ نرخ ثبت‌شده: <bdi dir="ltr">${rate}%</bdi>`;
}

/** Render stored amounts verbatim. This function never quotes or changes money,
 * payment, invoice numbering, ownership or inventory. Only the customer-safe
 * issued projection is printed; extra staff/audit/provider properties are ignored.
 */
export function buildInvoicePdfHtml(
  invoice: CustomerInvoice,
  assets: { fontWoff2: Buffer; wordmarkPng: Buffer },
): {
  html: string;
  htmlSha256: string;
  templateRevision: string;
  fontSha256: string;
  brandSha256: string;
} {
  try {
    if (
      !invoice ||
      Buffer.byteLength(JSON.stringify(invoice), "utf8") >
        INVOICE_PDF_LIMITS.inputBytes ||
      !Array.isArray(invoice.lines) ||
      invoice.lines.length < 1 ||
      invoice.lines.length > INVOICE_PDF_LIMITS.lines ||
      !Buffer.isBuffer(assets?.fontWoff2) ||
      assets.fontWoff2.length !== 111152 ||
      !Buffer.isBuffer(assets?.wordmarkPng) ||
      assets.wordmarkPng.length !== 459686 ||
      hash(assets.fontWoff2) !== INVOICE_PDF_ASSETS.fontSha256 ||
      hash(assets.wordmarkPng) !== INVOICE_PDF_ASSETS.brandSha256
    )
      invalid();
    const number = text(invoice.number, 40);
    if (
      !/^IRY-[0-9]{4}-[0-9]{6,9}$/u.test(invoice.number) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(
        invoice.issuedAt,
      )
    )
      invalid();
    const issuedAt = new Date(invoice.issuedAt);
    if (!Number.isFinite(issuedAt.getTime())) invalid();
    const date = escape(
      new Intl.DateTimeFormat("fa-IR", {
        timeZone: "Asia/Tehran",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(issuedAt),
    );
    const rows = invoice.lines
      .map((line, index) => {
        if (
          !line ||
          !Number.isSafeInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 1000
        )
          invalid();
        // Validate stored net amounts too, without recomputing financial policy.
        amount(line.netAmount);
        return `<tbody class="line"><tr><td colspan="4" class="item">ردیف ${index + 1} — <bdi dir="ltr">${text(line.sku, 128)}</bdi> — ${text(line.title, 500)} — تعداد: ${line.quantity}</td></tr><tr><td>${amount(line.unitPrice)}</td><td>${amount(line.discount)}</td><td>${amount(line.tax)}</td><td>${amount(line.total)}</td></tr></tbody>`;
      })
      .join("");
    const totals = [
      ["جمع اقلام", invoice.quote.subtotal],
      ["تخفیف", invoice.quote.discount],
      ["ارسال", invoice.quote.shipping],
      ["مالیات", invoice.quote.tax],
      ["مبلغ نهایی", invoice.quote.total],
    ]
      .map(
        ([label, value]) =>
          `<div><dt>${label}</dt><dd>${amount(value as Money)} ریال</dd></div>`,
      )
      .join("");
    amount(invoice.quote.netAmount);
    const policy = taxText(invoice.taxPolicy);
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<title>فاکتور فروشگاهی ${number}</title><style>
@font-face{font-family:InvoiceLocal;src:url(data:font/woff2;base64,${assets.fontWoff2.toString("base64")}) format('woff2');font-weight:100 900;font-display:block}
@page{size:A4;margin:14mm 10mm 18mm;@bottom-center{content:"${number} — فاکتور فروشگاهی ایرانی یراق — واحد مبالغ: ریال";font-family:InvoiceLocal,sans-serif;font-size:8px;direction:rtl}}*{box-sizing:border-box}body{margin:0;color:#111;background:#fff;font:10px/1.8 InvoiceLocal,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:20px;margin:4mm 0}h2{font-size:13px;margin:0 0 2mm}p{margin:1mm 0;overflow-wrap:anywhere}.brand{width:60mm;height:20mm;object-fit:contain;display:block;margin:0 auto 3mm}
.parties{display:table;table-layout:fixed;width:100%;margin:4mm 0}.party{display:table-cell;width:50%;vertical-align:top;padding:3mm;border:1px solid #aaa;overflow-wrap:anywhere}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;line-height:1.8}caption{text-align:right;font-size:13px;font-weight:700;margin-bottom:2mm}thead{display:table-header-group}tr,.line{break-inside:avoid}th,td{border:1px solid #aaa;padding:2mm;text-align:right;overflow-wrap:anywhere}th{background:#eee}.item{background:#fafafa}bdi{unicode-bidi:isolate}.amount{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px}
.summary{break-inside:avoid;margin-top:4mm}.totals{width:90mm;margin:3mm 0 3mm auto;font-size:11px}.totals div{display:table;width:100%;border-bottom:1px solid #ddd}.totals dt,.totals dd{display:table-cell;width:50%;padding:1mm;margin:0}.totals dd{text-align:left}.totals div:last-child{font-weight:700;border-bottom:2px solid #111}.totals .amount{font-size:11px}.notice{border:1px solid #aaa;padding:2mm}
</style></head><body><header><img class="brand" width="1086" height="362" src="data:image/png;base64,${assets.wordmarkPng.toString("base64")}" alt="ایرانی یراق"><h1>فاکتور فروشگاهی</h1><p>شمارهٔ سند: <bdi dir="ltr">${number}</bdi></p><p>زمان صدور: ${date}</p></header>
<section class="parties" aria-label="فروشنده و خریدار"><section class="party"><h2>فروشنده</h2><p>${text(invoice.seller.name, 200)}</p><p>${text(invoice.seller.address, 1000)}</p><p>${text(invoice.seller.contact, 200)}</p></section>
<section class="party"><h2>خریدار</h2><p>${text(invoice.buyerLabel, 300)}</p><p>${text(invoice.address.city, 100)}، ${text(invoice.address.address, 500)}</p><p>کد پستی: <bdi dir="ltr">${text(invoice.address.postalCode, 32)}</bdi></p><p>گیرنده: ${text(invoice.address.recipient, 120)}</p><p>تلفن: <bdi dir="ltr">${text(invoice.address.mobile, 32)}</bdi></p></section></section>
<p>روش تحویل: ${text(invoice.shippingTitle, 200)}</p><table><caption>اقلام فاکتور — مبالغ به ریال</caption><thead><tr>${["قیمت واحد", "تخفیف", "مالیات", "جمع"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead>${rows}</table>
<section class="summary"><dl class="totals">${totals}</dl><p>${policy}</p><p>مالیات ارسال: ${invoice.taxPolicy.shippingTaxable ? "طبق سیاست ثبت‌شده منظور شده است" : "در پایهٔ مالیات منظور نشده است"}</p><p class="notice">این سند از اطلاعات ثبت‌شدهٔ زمان صدور تهیه شده است و رسید پرداخت نیست. برای وضعیت پرداخت و وصول، جزئیات سفارش و دفترکل را بررسی کنید. این سند، صورتحساب سامانهٔ مؤدیان نیست.</p></section>
</body></html>`;
    if (Buffer.byteLength(html, "utf8") > INVOICE_PDF_LIMITS.htmlBytes)
      invalid();
    return {
      html,
      htmlSha256: hash(html),
      templateRevision: INVOICE_PDF_TEMPLATE_REVISION,
      ...INVOICE_PDF_ASSETS,
    };
  } catch {
    // Malformed persistence must not leak invoice text/PII through exceptions.
    throw new InvoicePdfInputError();
  }
}
