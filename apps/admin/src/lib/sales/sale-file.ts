import type { AdminFulfillmentStatus, AdminOrderStatus, AdminPaymentStatus } from '@/lib/orders/orders-types';
import { fulfillmentStatusLabel } from '@/lib/orders/orders-labels';

/**
 * The "sale file" (پروندهٔ فروش) condenses an order, its invoice, the payment and the delivery
 * into four steps with one clear next action. It only *describes* server state: it never
 * invents a payment, and it never decides eligibility the server has not already stated.
 */
export type StepState = 'done' | 'current' | 'upcoming' | 'blocked';
export type StepAction = { kind: 'create-draft' } | { kind: 'link'; label: string; href: string };
export type SaleStep = { key: 'order' | 'invoice' | 'payment' | 'delivery'; title: string; state: StepState; detail: string; action?: StepAction };

export type SaleFileInput = {
  orderStatus: AdminOrderStatus;
  paymentStatus: AdminPaymentStatus | null;
  fulfillmentStatus: AdminFulfillmentStatus | null;
  draft: { id: string; state: 'DRAFT' | 'ISSUED' | 'CANCELLED' } | null;
  document: { id: string; number: string } | null;
  /** null = unknown (not loaded or failed); never treated as published. */
  published: boolean | null;
  can: { manage: boolean; issue: boolean; publish: boolean };
};

const INVOICEABLE: ReadonlyArray<AdminOrderStatus> = ['PENDING_PAYMENT', 'PAID', 'CREDIT_APPROVED'];

function invoiceStep(input: SaleFileInput): SaleStep {
  const base = { key: 'invoice', title: 'فاکتور' } as const;
  const { document, draft, can } = input;
  if (document) {
    const href = `/invoices/documents/${encodeURIComponent(document.id)}`;
    if (input.published === true) return { ...base, state: 'done', detail: `فاکتور ${document.number} صادر و برای مشتری منتشر شده است.`, action: { kind: 'link', label: 'مشاهدهٔ فاکتور', href } };
    if (input.published === false) {
      return { ...base, state: 'current', detail: `فاکتور ${document.number} صادر شده، ولی هنوز برای مشتری منتشر نشده است.${can.publish ? '' : ' برای انتشار به دسترسی «انتشار فاکتور» نیاز است.'}`,
        action: { kind: 'link', label: can.publish ? 'انتشار برای مشتری' : 'مشاهدهٔ فاکتور', href } };
    }
    return { ...base, state: 'done', detail: `فاکتور ${document.number} صادر شده است؛ وضعیت انتشار بارگذاری نشد.`, action: { kind: 'link', label: 'مشاهدهٔ فاکتور', href } };
  }
  if (!INVOICEABLE.includes(input.orderStatus)) return { ...base, state: 'blocked', detail: 'برای سفارش در این وضعیت فاکتور صادر نمی‌شود.' };
  if (draft && draft.state === 'DRAFT') {
    return { ...base, state: 'current', detail: `پیش‌فاکتور ساخته شده است؛ مبلغ را بازقیمت‌گذاری و بررسی کنید و سپس صادر کنید.${can.issue ? '' : ' برای صدور به دسترسی «صدور فاکتور» نیاز است.'}`,
      action: { kind: 'link', label: can.issue ? 'ادامه و صدور فاکتور' : 'مشاهدهٔ پیش‌فاکتور', href: `/invoices/drafts/${encodeURIComponent(draft.id)}` } };
  }
  if (!can.manage) return { ...base, state: 'current', detail: 'هنوز پیش‌فاکتوری ساخته نشده است. برای ساخت به دسترسی «مدیریت فاکتور» نیاز است.' };
  return { ...base, state: 'current', detail: 'هنوز فاکتوری برای این سفارش ساخته نشده است.', action: { kind: 'create-draft' } };
}

function paymentStep(input: SaleFileInput): SaleStep {
  const base = { key: 'payment', title: 'پرداخت' } as const;
  switch (input.orderStatus) {
    case 'PAID': return { ...base, state: 'done', detail: 'پرداخت توسط سرور تأیید شده است.' };
    case 'CREDIT_APPROVED': return { ...base, state: 'done', detail: 'سفارش با اعتبار مشتری تأیید شده است؛ وصول وجه در حساب مشتری پیگیری می‌شود.' };
    case 'PENDING_PAYMENT': {
      const detail = input.paymentStatus === 'FAILED' ? 'آخرین تلاش پرداخت ناموفق بود؛ مشتری می‌تواند دوباره از حساب خود پرداخت کند.'
        : input.paymentStatus === 'PENDING' ? 'پرداخت در حال انجام یا در انتظار تأیید درگاه است؛ تا تأیید سرور، پرداخت‌شده حساب نمی‌شود.'
        : 'مشتری هنوز پرداخت را شروع نکرده است؛ او با ورود به حساب خود از صفحهٔ سفارش پرداخت می‌کند.';
      return { ...base, state: 'current', detail };
    }
    default: return { ...base, state: 'blocked', detail: 'این سفارش پرداخت‌پذیر نیست.' };
  }
}

function deliveryStep(input: SaleFileInput): SaleStep {
  const base = { key: 'delivery', title: 'تحویل' } as const;
  const status = input.fulfillmentStatus;
  if (status === 'DELIVERED') return { ...base, state: 'done', detail: 'سفارش تحویل شده است.' };
  if (status === 'CANCELLED' || status === 'RETURNED') return { ...base, state: 'blocked', detail: `وضعیت تحویل: ${fulfillmentStatusLabel(status)}.` };
  if (status === null || input.orderStatus === 'PENDING_PAYMENT') return { ...base, state: 'upcoming', detail: 'پس از تأیید پرداخت آماده‌سازی و ارسال شروع می‌شود.' };
  return { ...base, state: 'current', detail: `وضعیت تحویل: ${fulfillmentStatusLabel(status)}.` };
}

export function deriveSaleFile(input: SaleFileInput): { steps: SaleStep[]; next: SaleStep | null } {
  const steps: SaleStep[] = [
    { key: 'order', title: 'سفارش', state: 'done', detail: 'سفارش ثبت و موجودی رزرو شده است.' },
    invoiceStep(input), paymentStep(input), deliveryStep(input),
  ];
  return { steps, next: steps.find((step) => step.state === 'current' && step.action) ?? null };
}
