import type { AuthenticationLevel } from '@iranyaragh/contracts';
import type { StatusTone } from '@/components/ui/StatusChip';

/**
 * Pure Persian label + tone mappings for the session/devices panel (#50).
 *
 * Kept UI-agnostic (label + semantic tone) so components never embed enum ->
 * text decisions and tests can cover every value exhaustively.
 */

export type SessionLabel = { label: string; tone: StatusTone };

const authenticationLevel: Record<AuthenticationLevel, SessionLabel> = {
  STAFF_MFA: { label: 'مهر دو عاملی', tone: 'success' },
  CUSTOMER_OTP: { label: 'رمز یک‌بارمصرف', tone: 'info' },
};

const current: SessionLabel = { label: 'این دستگاه', tone: 'success' };

/** Formats an ISO timestamp for the Persian (Jalali) operations UI. */
export function formatDateTime(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Persian relative "expires in / expired" label for a session's expiry. */
export function expiryLabel(iso: string): { label: string; tone: StatusTone } {
  const expiry = new Date(iso).getTime();
  if (Number.isNaN(expiry)) return { label: '—', tone: 'neutral' };
  if (expiry <= Date.now()) return { label: 'منقضی شده', tone: 'warning' };
  const remainingMinutes = Math.round((expiry - Date.now()) / 60_000);
  if (remainingMinutes < 60) {
    return { label: `${remainingMinutes} دقیقه مانده`, tone: 'info' };
  }
  const remainingHours = Math.round(remainingMinutes / 60);
  if (remainingHours < 48) {
    return { label: `${remainingHours} ساعت مانده`, tone: 'info' };
  }
  return { label: `${Math.round(remainingHours / 24)} روز مانده`, tone: 'info' };
}

export const sessionLabels = {
  authenticationLevel: (value: AuthenticationLevel): SessionLabel =>
    authenticationLevel[value] ?? { label: 'نامشخص', tone: 'neutral' },
  current,
  deviceName: (value: string | null): string => value && value.trim().length > 0 ? value : 'دستگاه ناشناخته',
};