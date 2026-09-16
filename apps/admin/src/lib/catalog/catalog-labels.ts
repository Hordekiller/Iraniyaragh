import type { AttributeStatus, CatalogStatus, Money, VariantPriceSource, VariantStatus } from '@iranyaragh/contracts';
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

export const VARIANT_STATUS_META: Record<VariantStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  INACTIVE: { label: 'غیرفعال', tone: 'neutral' },
  ARCHIVED: { label: 'بایگانی‌شده', tone: 'error' },
};

export function variantStatusLabel(status: VariantStatus): string {
  return VARIANT_STATUS_META[status].label;
}

export function variantStatusTone(status: VariantStatus): StatusTone {
  return VARIANT_STATUS_META[status].tone;
}

export const ATTRIBUTE_STATUS_META: Record<AttributeStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  INACTIVE: { label: 'غیرفعال', tone: 'neutral' },
};

export function attributeStatusLabel(status: AttributeStatus): string {
  return ATTRIBUTE_STATUS_META[status].label;
}

export function attributeStatusTone(status: AttributeStatus): StatusTone {
  return ATTRIBUTE_STATUS_META[status].tone;
}

export const VARIANT_PRICE_SOURCE_META: Record<VariantPriceSource, { label: string }> = {
  ADMIN: { label: 'افزایش دستی' },
  IMPORT: { label: 'وارادات' },
  SYSTEM: { label: 'سیستم' },
};

export function variantPriceSourceLabel(source: VariantPriceSource): string {
  return VARIANT_PRICE_SOURCE_META[source].label;
}

export function formatAmountNumber(value: string): string {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? value : faNumber.format(parsed);
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