import type { CatalogStatus, Money } from '@iranyaragh/contracts';
import type { StatusTone } from '@/components/ui/StatusChip';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const AMOUNT_PATTERN = /^\d{1,15}$/u;

export const CATALOG_STATUS_META: Record<
  CatalogStatus,
  { label: string; tone: StatusTone }
> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  PUBLISHED: { label: 'منتشرشده', tone: 'success' },
  ARCHIVED: { label: 'بایگانی‌شده', tone: 'error' },
};

export function catalogStatusLabel(status: CatalogStatus): string {
  return CATALOG_STATUS_META[status].label;
}

export function catalogStatusTone(status: CatalogStatus): StatusTone {
  return CATALOG_STATUS_META[status].tone;
}

const faNumber = new Intl.NumberFormat('fa-IR');

export function formatRial(money: Money): string {
  const amount = Number.parseInt(money.amount, 10);
  if (Number.isNaN(amount)) return `${money.amount} ریال`;
  return `${faNumber.format(amount)} ریال`;
}

export function displayAmount(amount: string): string {
  return faNumber.format(Number.parseInt(amount, 10));
}

export function normalizeSlug(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}