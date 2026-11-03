import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth/token-store";
import { randomUuid } from "@/lib/crypto/random-uuid";
export const doorAdminRoot = "/custom-doors/admin";
export async function doorAdmin<T>(
  path: string,
  method: "GET" | "PUT" | "POST" = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  return (
    await apiFetch<T>(`${doorAdminRoot}${path}`, {
      token: getAccessToken(),
      method,
      ...(body === undefined ? {} : { body }),
      ...(key ? { headers: { "Idempotency-Key": key } } : {}),
    })
  ).data;
}
export const doorKey = () => `door-${randomUuid()}`;
export const doorMoneyLabel = (amount: string | null) =>
  amount === null
    ? "نیازمند تأیید"
    : `${new Intl.NumberFormat("fa-IR").format(BigInt(amount))} ریال`;
export function doorAdminError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "AUTH_REAUTHENTICATION_REQUIRED")
      return "تأیید تازه رمز و کد دومرحله‌ای لازم است؛ پس از تأیید، همین درخواست را تکرار کنید.";
    if (error.code === "FORBIDDEN") return "مجوز این عملیات را ندارید.";
    if (/[\u0600-\u06ff]/.test(error.message)) return error.message;
  }
  return "عملیات تأیید نشد؛ وضعیت را از سرور دریافت و بررسی کنید.";
}
export function doorCanonicalNumber(value: string): string {
  return value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
}
