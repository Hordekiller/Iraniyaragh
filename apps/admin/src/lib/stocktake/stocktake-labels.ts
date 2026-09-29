import type { StocktakeScopeType, StocktakeStatus } from '@iranyaragh/contracts';

export const stocktakeStatusLabels: Record<StocktakeStatus, string> = {
  DRAFT: 'پیش‌نویس',
  COUNTING: 'در حال شمارش',
  REVIEW: 'در بازبینی',
  COMPLETED: 'تأییدشده',
  CANCELLED: 'لغوشده',
};

export const stocktakeScopeLabels: Record<StocktakeScopeType, string> = {
  WAREHOUSE: 'کل انبار',
  LOCATIONS: 'مکان‌های انتخابی',
  VARIANTS: 'SKUهای انتخابی',
};

export const stocktakeStatusTone: Record<StocktakeStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'default',
  COUNTING: 'info',
  REVIEW: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
};
