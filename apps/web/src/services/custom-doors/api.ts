import type {
  DoorCatalog,
  DoorOrderInput,
  DoorOrderView,
  DoorQuoteSnapshot,
  PaymentInitiation,
} from "@iranyaragh/contracts";
import type { AuthenticatedJsonRequest } from "../../state/auth-context";
import { jsonRequest } from "../../lib/auth/request";
import { AuthApiError } from "../../lib/auth/errors";
export const doorApi = "/api/v1/custom-door-orders";
export async function loadDoorCatalog(): Promise<DoorCatalog> {
  return (await jsonRequest<DoorCatalog>("/api/v1/custom-doors/catalog")).data;
}
export async function previewDoors(
  input: DoorOrderInput,
): Promise<DoorQuoteSnapshot> {
  return (
    await jsonRequest<{ quote: DoorQuoteSnapshot }>(
      "/api/v1/custom-doors/quote-preview",
      { json: input },
    )
  ).data.quote;
}
export async function createDoorOrder(
  request: AuthenticatedJsonRequest,
  input: DoorOrderInput,
  key: string,
  draft = false,
) {
  return (
    await request<{ order: DoorOrderView }>(
      `${doorApi}${draft ? "/drafts" : ""}`,
      { method: "POST", json: input, headers: { "Idempotency-Key": key } },
    )
  ).data.order;
}
export async function doorCommand(
  request: AuthenticatedJsonRequest,
  id: string,
  action: string,
  input: unknown,
  key: string,
) {
  return (
    await request<{ order: DoorOrderView }>(
      `${doorApi}/${encodeURIComponent(id)}/${action}`,
      { method: "POST", json: input, headers: { "Idempotency-Key": key } },
    )
  ).data.order;
}
export async function doorPayment(
  request: AuthenticatedJsonRequest,
  id: string,
  key: string,
): Promise<PaymentInitiation> {
  return (
    await request<{ payment: PaymentInitiation }>(
      `${doorApi}/${encodeURIComponent(id)}/payment`,
      { method: "POST", headers: { "Idempotency-Key": key } },
    )
  ).data.payment;
}
export function doorError(error: unknown): string {
  if (error instanceof AuthApiError) {
    if (error.code === "PAYMENT_PROVIDER_DISABLED")
      return "درگاه در این محیط فعال نیست. پرداختی تأیید نشده است.";
    if (error.code === "PAYMENT_RESULT_UNCONFIRMED")
      return "درخواست پرداخت نیازمند تطبیق است؛ برای جلوگیری از پرداخت تکراری منتظر بررسی بمانید.";
    if (error.code === "RATE_LIMITED")
      return "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.";
    if (error.statusCode === 404) return "سفارش در دسترس نیست.";
    if (error.statusCode === 401) return "نشست معتبر نیست؛ دوباره وارد شوید.";
    if (
      (error.statusCode ?? 0) >= 400 &&
      (error.statusCode ?? 0) < 500 &&
      /[\u0600-\u06ff]/.test(error.message)
    )
      return error.message;
  }
  return "نتیجه عملیات تأیید نشد. اتصال را بررسی و دوباره تلاش کنید.";
}
export function doorDigits(value: string): string {
  return value
    .trim()
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
}
export function doorRial(amount: string | null): string {
  return amount === null
    ? "نیازمند تأیید قیمت"
    : `${new Intl.NumberFormat("fa-IR").format(BigInt(amount))} ریال`;
}
export const doorButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-orange-700";

export type DoorSubmission = {
  key: string;
  input: DoorOrderInput;
  draft: boolean;
};
export function readDoorSubmission(storageKey: string): DoorSubmission | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null",
    ) as DoorSubmission | null;
    return value &&
      /^door-[A-Za-z0-9-]{8,80}$/.test(value.key) &&
      typeof value.draft === "boolean" &&
      Array.isArray(value.input?.items) &&
      value.input.items.length > 0 &&
      value.input.items.length <= 50
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveDoorSubmission(
  storageKey: string,
  submission: DoorSubmission | null,
) {
  try {
    if (submission)
      sessionStorage.setItem(storageKey, JSON.stringify(submission));
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* In-memory replay remains available if storage is disabled. */
  }
}
