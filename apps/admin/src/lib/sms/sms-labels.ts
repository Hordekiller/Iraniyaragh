import type {
  SmsCircuitState,
  SmsErrorClass,
  SmsProviderEnvironment,
  SmsProviderHealth,
  SmsSecretBackendCapability,
  SmsSendStatus,
} from '@iranyaragh/contracts';
import type { StatusTone } from '@/components/ui/StatusChip';

/**
 * Pure Persian label + tone mappings for the SMS settings panel (issue #115).
 *
 * Kept UI-agnostic (label + semantic tone) so components never embed enum -> text
 * decisions and tests can cover every value exhaustively.
 */

export type SmsLabel = { label: string; tone: StatusTone };

const environment: Record<SmsProviderEnvironment, string> = {
  development: 'توسعه',
  production: 'تولید',
  unknown: 'نامشخص',
};

const backend: Record<SmsSecretBackendCapability, { label: string; tone: StatusTone; note: string }> = {
  writable: { label: 'قابل تغییر', tone: 'success', note: 'کلید از پنل قابل چرخش یا پاک‌سازی است.' },
  read_only: {
    label: 'فقط‌خواندنی',
    tone: 'info',
    note: 'اسرار از محیط تأمین می‌شوند؛ چرخش و پاک‌سازی در پنل در دسترس نیست.',
  },
};

const health: Record<SmsProviderHealth, SmsLabel> = {
  ok: { label: 'سالم', tone: 'success' },
  degraded: { label: 'کاهیده', tone: 'warning' },
  down: { label: 'غیرفعال', tone: 'error' },
  not_configured: { label: 'پیکربندی‌نشده', tone: 'neutral' },
  unknown: { label: 'نامشخص', tone: 'neutral' },
};

const circuit: Record<SmsCircuitState, SmsLabel> = {
  closed: { label: 'بسته', tone: 'success' },
  open: { label: 'باز', tone: 'error' },
  half_open: { label: 'نیمه‌باز', tone: 'warning' },
  unknown: { label: 'نامشخص', tone: 'neutral' },
};

const errorClass: Record<SmsErrorClass, string> = {
  auth: 'خطای احراز هویت',
  rate_limit: 'محدودیت نرخ',
  invalid_request: 'درخواست نامعتبر',
  provider_error: 'خطای سرویس‌دهنده',
  timeout: 'مهلت منقضی',
  not_configured: 'پیکربندی‌نشده',
};

const sendStatus: Record<SmsSendStatus, SmsLabel> = {
  accepted: { label: 'ارجاع داده شد', tone: 'success' },
  rejected: { label: 'رد شد', tone: 'error' },
  rate_limited: { label: 'محدودیت نرخ', tone: 'warning' },
  unavailable: { label: 'در دسترس نیست', tone: 'error' },
  unknown_result: { label: 'نتیجه نامشخص', tone: 'neutral' },
};

export const smsLabels = {
  environment: (value: SmsProviderEnvironment): string => environment[value] ?? environment.unknown,
  backend,
  backendOf: (value: SmsSecretBackendCapability): { label: string; tone: StatusTone; note: string } =>
    backend[value] ?? backend.read_only,
  health: (value: SmsProviderHealth): SmsLabel => health[value] ?? health.unknown,
  circuit: (value: SmsCircuitState): SmsLabel => circuit[value] ?? circuit.unknown,
  errorClass: (value: SmsErrorClass | null): string =>
    value === null ? 'بدون خطا' : (errorClass[value] ?? errorClass.invalid_request),
  sendStatus: (value: SmsSendStatus): SmsLabel => sendStatus[value] ?? sendStatus.unknown_result,
};

/** Formats an ISO timestamp for the Persian (Jalali) operations UI. */
export function formatDateTime(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export const yesNo = (value: boolean): string => (value ? 'بله' : 'خیر');