import { createHash } from "node:crypto";
import type { CustomerInvoice, Money } from "@iranyaragh/contracts";

// Internal rendering boundary only. Authorization, durable jobs and private
// artifact downloads must be implemented before exposing a PDF endpoint.
export const INVOICE_PDF_TEMPLATE_REVISION = "store-invoice-a4-v4";
/** Earlier layouts stay renderable byte for byte, so evidence of an already rendered PDF can be reproduced. */
export const INVOICE_PDF_PREVIOUS_REVISIONS = Object.freeze(["store-invoice-a4-v1", "store-invoice-a4-v2", "store-invoice-a4-v3"]);
/** Revisions printed with the first wordmark asset. */
const FIRST_WORDMARK_REVISIONS = ["store-invoice-a4-v1", "store-invoice-a4-v2"];
export const invoicePdfUsesFirstWordmark = (templateRevision: string): boolean => FIRST_WORDMARK_REVISIONS.includes(templateRevision);
export const INVOICE_PDF_LEGACY_BRAND_SHA256 = "457401b43c2c484ced56e1858da9c84a0998d86099ab0935e82bad90f69cbcc4";
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
    "11721abcea4c1366971cee1124d88cc4226ea4d14d4fd9af55ecbec08e4c1cf1",
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

const isZero = (value: Money): boolean => value?.amount === "0";

/**
 * Current customer layout (v4): wordmark and document identity side by side,
 * seller/buyer cards, one row per item and a totals box.
 *
 * The customer copy carries no tax column, row, rate or exemption text. Stored
 * amounts are printed verbatim; the single exception is a document whose stored
 * total is not explained by items, discount and shipping alone (a separately
 * added tax), where the tax line is kept so the printed figures still add up.
 */
function currentInvoiceHtml(
  invoice: CustomerInvoice,
  parts: { number: string; date: string; fontBase64: string; wordmarkBase64: string },
): string {
  // Display decision only, never a recalculation: is the stored total explained by the printed rows?
  const figure = (value: Money): bigint => { amount(value); return BigInt(value.amount); };
  const explained = figure(invoice.quote.subtotal) - figure(invoice.quote.discount) + figure(invoice.quote.shipping) === figure(invoice.quote.total);
  const taxAdded = !explained && !isZero(invoice.quote.tax);
  const showDiscount = !isZero(invoice.quote.discount) || invoice.lines.some((line) => !isZero(line?.discount));
  const rows = invoice.lines
    .map((line, index) => {
      if (!line || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000) invalid();
      // Validate every stored component, including the ones this layout does not print.
      amount(line.netAmount);
      amount(line.tax);
      const discount = amount(line.discount);
      return `<tr><td class="n">${index + 1}</td><td class="d"><span class="t">${text(line.title, 500)}</span><span class="s">کد کالا: <bdi dir="ltr">${text(line.sku, 128)}</bdi></span></td><td class="q">${line.quantity}</td><td class="m">${amount(line.unitPrice)}</td>${showDiscount ? `<td class="m">${discount}</td>` : ""}<td class="m total">${amount(line.total)}</td></tr>`;
    })
    .join("");
  amount(invoice.quote.netAmount);
  const tax = amount(invoice.quote.tax);
  const totals = [
    ["جمع اقلام", amount(invoice.quote.subtotal), ""],
    ...(showDiscount ? [["تخفیف", amount(invoice.quote.discount), ""]] : []),
    ["هزینهٔ ارسال", amount(invoice.quote.shipping), ""],
    ...(taxAdded ? [["مالیات", tax, ""]] : []),
    ["مبلغ نهایی", amount(invoice.quote.total), " grand"],
  ]
    .map(([label, value, modifier]) => `<div class="row${modifier}"><dt>${label}</dt><dd>${value} <span class="unit">ریال</span></dd></div>`)
    .join("");
  const headers = ["ردیف", "شرح کالا", "تعداد", "قیمت واحد", ...(showDiscount ? ["تخفیف"] : []), "مبلغ کل"];
  const widths = showDiscount ? ["9mm", "auto", "14mm", "30mm", "26mm", "32mm"] : ["9mm", "auto", "16mm", "34mm", "36mm"];
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<title>فاکتور فروش ${parts.number}</title><style>
@font-face{font-family:InvoiceLocal;src:url(data:font/woff2;base64,${parts.fontBase64}) format('woff2');font-weight:100 900;font-display:block}
@page{size:A4;margin:12mm 12mm 16mm;@bottom-center{content:"${parts.number} — فاکتور فروش — مبالغ به ریال";font-family:InvoiceLocal,sans-serif;font-size:8px;color:#6b7280;direction:rtl}}
*{box-sizing:border-box}body{margin:0;color:#1f2937;background:#fff;font:10.5px/1.75 InvoiceLocal,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
bdi{unicode-bidi:isolate}p{margin:0;overflow-wrap:anywhere}h1,h2{margin:0}
.head{display:table;width:100%;table-layout:fixed;border-bottom:1.2mm solid #1c2434;padding-bottom:4mm}
.head>div{display:table-cell;vertical-align:middle}.brand{width:62mm;height:21mm;object-fit:contain;object-position:right center;display:block}
.identity{width:74mm}.identity h1{font-size:19px;font-weight:800;color:#1c2434;line-height:1.5;text-align:left}
.meta{margin-top:1.5mm;border:.25mm solid #d1d5db;border-radius:1.6mm;overflow:hidden}.meta div{display:table;width:100%;table-layout:fixed}.meta div+div{border-top:.25mm solid #e5e7eb}
.meta span{display:table-cell;padding:1mm 2.5mm;font-size:9.5px}.meta .k{width:24mm;background:#f3f4f6;color:#4b5563}.meta .v{font-weight:700;text-align:left}
.parties{display:table;width:100%;table-layout:fixed;border-spacing:0;margin:5mm 0 3mm}.party{display:table-cell;width:50%;vertical-align:top;border:.25mm solid #d1d5db;border-radius:1.6mm;padding:0 0 2.5mm;overflow-wrap:anywhere}
.party+.gap{display:table-cell;width:4mm;border:0}.party h2{font-size:10.5px;font-weight:800;color:#fff;background:#1c2434;padding:1mm 3mm;border-radius:1.2mm 1.2mm 0 0;margin-bottom:1.5mm}.party p{padding:0 3mm}
.party .name{font-weight:700;font-size:11px}.party .k{color:#6b7280}
.delivery{margin:0 0 3mm;padding:1.4mm 3mm;background:#f9fafb;border:.25mm solid #e5e7eb;border-radius:1.6mm}.delivery b{font-weight:700}
table{width:100%;table-layout:fixed;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid}
th{background:#1c2434;color:#fff;font-weight:700;font-size:9.5px;padding:1.8mm 2mm;text-align:center;border:.25mm solid #1c2434}
td{padding:1.8mm 2mm;border:.25mm solid #d1d5db;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#f9fafb}
.n,.q,.m{text-align:center}.total{font-weight:700}.d .t{display:block;font-weight:600}.d .s{display:block;font-size:8.5px;color:#6b7280}
.amount{white-space:nowrap;font-variant-numeric:tabular-nums}
.summary{break-inside:avoid;margin-top:4mm;display:table;width:100%;table-layout:fixed}.summary>div{display:table-cell;vertical-align:top}
.notice{padding-left:5mm;font-size:8.5px;color:#6b7280;line-height:1.9}
.totals{width:78mm;margin:0;border:.25mm solid #d1d5db;border-radius:1.6mm;overflow:hidden}.totals .row{display:table;width:100%;table-layout:fixed}.totals .row+.row{border-top:.25mm solid #e5e7eb}
.totals dt,.totals dd{display:table-cell;padding:1.5mm 3mm;margin:0}.totals dt{width:30mm;color:#4b5563}.totals dd{text-align:left;font-weight:600}.unit{font-size:8.5px;color:#6b7280;font-weight:400}
.totals .grand dt,.totals .grand dd{background:#1c2434;color:#fff;font-weight:800;font-size:12px}.totals .grand .unit{color:#e5e7eb}
</style></head><body>
<header class="head"><div><img class="brand" width="1086" height="370" src="data:image/png;base64,${parts.wordmarkBase64}" alt="ایرانی یراق"></div>
<div class="identity"><h1>فاکتور فروش</h1><div class="meta"><div><span class="k">شمارهٔ فاکتور</span><span class="v"><bdi dir="ltr">${parts.number}</bdi></span></div><div><span class="k">تاریخ صدور</span><span class="v">${parts.date}</span></div></div></div></header>
<section class="parties" aria-label="فروشنده و خریدار"><section class="party"><h2>فروشنده</h2><p class="name">${text(invoice.seller.name, 200)}</p><p>${text(invoice.seller.address, 1000)}</p><p><span class="k">تماس:</span> ${text(invoice.seller.contact, 200)}</p></section><div class="gap"></div>
<section class="party"><h2>خریدار</h2><p class="name">${text(invoice.buyerLabel, 300)}</p><p>${text(invoice.address.city, 100)}، ${text(invoice.address.address, 500)}</p><p><span class="k">کد پستی:</span> <bdi dir="ltr">${text(invoice.address.postalCode, 32)}</bdi></p><p><span class="k">گیرنده:</span> ${text(invoice.address.recipient, 120)} — <span class="k">تلفن:</span> <bdi dir="ltr">${text(invoice.address.mobile, 32)}</bdi></p></section></section>
<p class="delivery"><span class="k">روش تحویل:</span> <b>${text(invoice.shippingTitle, 200)}</b></p>
<table><colgroup>${widths.map((width) => `<col style="width:${width}">`).join("")}</colgroup><thead><tr>${headers.map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
<section class="summary"><div class="notice"><p>مبالغ این فاکتور به ریال است.</p><p>این سند از اطلاعات ثبت‌شدهٔ زمان صدور تهیه شده است و رسید پرداخت نیست. این سند، صورتحساب سامانهٔ مؤدیان نیست.</p></div><div style="width:78mm"><dl class="totals">${totals}</dl></div></section>
</body></html>`;
}

/** Render stored amounts verbatim. This function never quotes or changes money,
 * payment, invoice numbering, ownership or inventory. Only the customer-safe
 * issued projection is printed; extra staff/audit/provider properties are ignored.
 */
export function buildInvoicePdfHtml(
  invoice: CustomerInvoice,
  assets: { fontWoff2: Buffer; wordmarkPng: Buffer },
  templateRevision: string = INVOICE_PDF_TEMPLATE_REVISION,
): {
  html: string;
  htmlSha256: string;
  templateRevision: string;
  fontSha256: string;
  brandSha256: string;
} {
  try {
    if (![...INVOICE_PDF_PREVIOUS_REVISIONS, INVOICE_PDF_TEMPLATE_REVISION].includes(templateRevision)) throw new InvoicePdfInputError();
    const legacy = invoicePdfUsesFirstWordmark(templateRevision);
    const current = templateRevision === INVOICE_PDF_TEMPLATE_REVISION;
    const expectedBrandHash = legacy ? INVOICE_PDF_LEGACY_BRAND_SHA256 : INVOICE_PDF_ASSETS.brandSha256;
    const brandName = templateRevision === "store-invoice-a4-v1" ? "ایران یراق" : "ایرانی یراق";
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
      assets.wordmarkPng.length !== (legacy ? 459686 : 427408) ||
      hash(assets.fontWoff2) !== INVOICE_PDF_ASSETS.fontSha256 ||
      hash(assets.wordmarkPng) !== expectedBrandHash
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
    const policy = taxText(invoice.taxPolicy);
    if (current) {
      const html = currentInvoiceHtml(invoice, { number, date, fontBase64: assets.fontWoff2.toString("base64"), wordmarkBase64: assets.wordmarkPng.toString("base64") });
      if (Buffer.byteLength(html, "utf8") > INVOICE_PDF_LIMITS.htmlBytes) invalid();
      return { html, htmlSha256: hash(html), templateRevision, ...INVOICE_PDF_ASSETS, brandSha256: expectedBrandHash };
    }
    // An exempt invoice carries no tax to explain to the customer, so tax columns, rows, the
    // policy sentence and the internal exemption reason are not printed. A non-zero stored
    // tax amount is still shown (it must never be hidden).
    const showTax =
      invoice.taxPolicy.treatment !== "EXEMPT" ||
      invoice.quote?.tax?.amount !== "0" ||
      !Array.isArray(invoice.lines) ||
      invoice.lines.some((line) => line?.tax?.amount !== "0");
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
        return `<tbody class="line"><tr><td colspan="${showTax ? 4 : 3}" class="item">ردیف ${index + 1} — <bdi dir="ltr">${text(line.sku, 128)}</bdi> — ${text(line.title, 500)} — تعداد: ${line.quantity}</td></tr><tr><td>${amount(line.unitPrice)}</td><td>${amount(line.discount)}</td>${showTax ? `<td>${amount(line.tax)}</td>` : ""}<td>${amount(line.total)}</td></tr></tbody>`;
      })
      .join("");
    const totals = [
      ["جمع اقلام", invoice.quote.subtotal],
      ["تخفیف", invoice.quote.discount],
      ["ارسال", invoice.quote.shipping],
      ...(showTax ? [["مالیات", invoice.quote.tax]] : []),
      ["مبلغ نهایی", invoice.quote.total],
    ]
      .map(
        ([label, value]) =>
          `<div><dt>${label}</dt><dd>${amount(value as Money)} ریال</dd></div>`,
      )
      .join("");
    amount(invoice.quote.netAmount);
    const taxNotes = showTax
      ? `<p>${policy}</p><p>مالیات ارسال: ${invoice.taxPolicy.shippingTaxable ? "طبق سیاست ثبت‌شده منظور شده است" : "در پایهٔ مالیات منظور نشده است"}</p>`
      : "";
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<title>فاکتور فروشگاهی ${number}</title><style>
@font-face{font-family:InvoiceLocal;src:url(data:font/woff2;base64,${assets.fontWoff2.toString("base64")}) format('woff2');font-weight:100 900;font-display:block}
@page{size:A4;margin:14mm 10mm 18mm;@bottom-center{content:"${number} — فاکتور فروشگاهی${legacy ? ` ${brandName}` : ""} — واحد مبالغ: ریال";font-family:InvoiceLocal,sans-serif;font-size:8px;direction:rtl}}*{box-sizing:border-box}body{margin:0;color:#111;background:#fff;font:10px/1.8 InvoiceLocal,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:20px;margin:4mm 0}h2{font-size:13px;margin:0 0 2mm}p{margin:1mm 0;overflow-wrap:anywhere}.brand{width:60mm;height:20mm;object-fit:contain;display:block;margin:0 auto 3mm}
.parties{display:table;table-layout:fixed;width:100%;margin:4mm 0}.party{display:table-cell;width:50%;vertical-align:top;padding:3mm;border:1px solid #aaa;overflow-wrap:anywhere}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;line-height:1.8}caption{text-align:right;font-size:13px;font-weight:700;margin-bottom:2mm}thead{display:table-header-group}tr,.line{break-inside:avoid}th,td{border:1px solid #aaa;padding:2mm;text-align:right;overflow-wrap:anywhere}th{background:#eee}.item{background:#fafafa}bdi{unicode-bidi:isolate}.amount{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px}
.summary{break-inside:avoid;margin-top:4mm}.totals{width:90mm;margin:3mm 0 3mm auto;font-size:11px}.totals div{display:table;width:100%;border-bottom:1px solid #ddd}.totals dt,.totals dd{display:table-cell;width:50%;padding:1mm;margin:0}.totals dd{text-align:left}.totals div:last-child{font-weight:700;border-bottom:2px solid #111}.totals .amount{font-size:11px}.notice{border:1px solid #aaa;padding:2mm}
</style></head><body><header><img class="brand" width="1086" height="${legacy ? 362 : 370}" src="data:image/png;base64,${assets.wordmarkPng.toString("base64")}" alt="${brandName}"><h1>فاکتور فروشگاهی</h1><p>شمارهٔ سند: <bdi dir="ltr">${number}</bdi></p><p>زمان صدور: ${date}</p></header>
<section class="parties" aria-label="فروشنده و خریدار"><section class="party"><h2>فروشنده</h2><p>${text(invoice.seller.name, 200)}</p><p>${text(invoice.seller.address, 1000)}</p><p>${text(invoice.seller.contact, 200)}</p></section>
<section class="party"><h2>خریدار</h2><p>${text(invoice.buyerLabel, 300)}</p><p>${text(invoice.address.city, 100)}، ${text(invoice.address.address, 500)}</p><p>کد پستی: <bdi dir="ltr">${text(invoice.address.postalCode, 32)}</bdi></p><p>گیرنده: ${text(invoice.address.recipient, 120)}</p><p>تلفن: <bdi dir="ltr">${text(invoice.address.mobile, 32)}</bdi></p></section></section>
<p>روش تحویل: ${text(invoice.shippingTitle, 200)}</p><table><caption>اقلام فاکتور — مبالغ به ریال</caption><thead><tr>${["قیمت واحد", "تخفیف", ...(showTax ? ["مالیات"] : []), "جمع"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead>${rows}</table>
<section class="summary"><dl class="totals">${totals}</dl>${taxNotes}<p class="notice">این سند از اطلاعات ثبت‌شدهٔ زمان صدور تهیه شده است و رسید پرداخت نیست. برای وضعیت پرداخت و وصول، جزئیات سفارش و دفترکل را بررسی کنید. این سند، صورتحساب سامانهٔ مؤدیان نیست.</p></section>
</body></html>`;
    if (Buffer.byteLength(html, "utf8") > INVOICE_PDF_LIMITS.htmlBytes)
      invalid();
    return {
      html,
      htmlSha256: hash(html),
      templateRevision,
      ...INVOICE_PDF_ASSETS,
      brandSha256: expectedBrandHash,
    };
  } catch {
    // Malformed persistence must not leak invoice text/PII through exceptions.
    throw new InvoicePdfInputError();
  }
}
