import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromotionAdmin } from '@iranyaragh/contracts';
import { PromotionsPage } from './PromotionsPage';
import { ApiClientError } from '@/lib/api/client';
import { createPromotion, listPromotions, setPromotionActive } from '@/lib/promotions/promotions-api';

const auth = vi.hoisted(() => ({ user: { userId: 'op', permissions: ['promotions.read', 'promotions.manage', 'reports.read'] } as { userId: string; permissions: string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/catalog/catalog-api', () => ({
  listBrands: vi.fn().mockResolvedValue([]), listCategories: vi.fn().mockResolvedValue([]),
  listProducts: vi.fn().mockResolvedValue({ items: [] }), getProduct: vi.fn(),
}));
vi.mock('@/lib/promotions/promotions-api', () => ({
  listPromotions: vi.fn(), createPromotion: vi.fn(), updatePromotion: vi.fn(), setPromotionActive: vi.fn(),
  listCoupons: vi.fn(), generateCoupons: vi.fn(), setCouponActive: vi.fn(), listRedemptions: vi.fn(), readPromotionReport: vi.fn(),
}));

const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const promo: PromotionAdmin = {
  id: 'p1', name: 'جشنوارهٔ پاییز', description: null, badgeText: null, kind: 'PERCENTAGE', mode: 'COUPON', percentBp: 1500, amount: null,
  maxDiscount: null, minOrder: null, maxOrder: null, startsAt: null, endsAt: null, maxRedemptions: 10, perCustomerLimit: 1,
  firstPurchaseOnly: false, customerId: null, stackable: false, priority: 100, targets: [], isActive: true, state: 'ACTIVE',
  usedCount: 2, couponCount: 3, version: 4, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  stats: { reserved: 1, confirmed: 1, released: 0, refunded: 0, discountConfirmed: money('15000'), discountRefunded: money('0'), salesAttributed: money('100000') },
};

describe('Admin promotions', () => {
  beforeEach(() => {
    auth.user = { userId: 'op', permissions: ['promotions.read', 'promotions.manage', 'reports.read'] };
    vi.mocked(listPromotions).mockReset().mockResolvedValue({ items: [promo], total: 1 });
    vi.mocked(setPromotionActive).mockReset().mockResolvedValue({ ...promo, isActive: false, version: 5 });
    vi.mocked(createPromotion).mockReset().mockResolvedValue(promo);
  });

  it('is unavailable without the promotions permission and never calls the API', () => {
    auth.user = { userId: 'x', permissions: ['orders.read'] };
    render(<PromotionsPage />);
    expect(screen.getByText(/دسترسی مدیریت تخفیف‌ها لازم است/)).toBeInTheDocument();
    expect(listPromotions).not.toHaveBeenCalled();
  });

  it('read-only operators see campaigns but get no create, edit or toggle controls', async () => {
    auth.user = { userId: 'ro', permissions: ['promotions.read'] };
    render(<PromotionsPage />);
    expect(await screen.findByText('جشنوارهٔ پاییز')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'کمپین جدید' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /غیرفعال‌سازی جشنوارهٔ پاییز/ })).toBeDisabled();
    expect(screen.queryByRole('tab', { name: 'سابقهٔ استفاده' })).toBeNull();
  });

  it('shows persisted campaigns with state and usage, and asks confirmation before an immediate deactivation', async () => {
    render(<PromotionsPage />);
    expect(await screen.findByText('جشنوارهٔ پاییز')).toBeInTheDocument();
    expect(screen.getByText('فعال', { selector: '.MuiChip-label' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /غیرفعال‌سازی جشنوارهٔ پاییز/ }));
    expect(await screen.findByText('غیرفعال‌سازی فوری کمپین')).toBeInTheDocument();
    expect(setPromotionActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال کن' }));
    await waitFor(() => expect(setPromotionActive).toHaveBeenCalledWith('p1', false, 4, expect.stringMatching(/^promo-/)));
    expect(await screen.findByText(/بلافاصله غیرفعال شد/)).toBeInTheDocument();
  });

  it('shows a precise message for a stale version and an empty state for no results', async () => {
    vi.mocked(setPromotionActive).mockRejectedValueOnce(new ApiClientError({ code: 'STALE_VERSION', message: '', statusCode: 409, requestId: 't' }));
    render(<PromotionsPage />);
    await screen.findByText('جشنوارهٔ پاییز');
    fireEvent.click(screen.getByRole('checkbox', { name: /غیرفعال‌سازی جشنوارهٔ پاییز/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'غیرفعال کن' }));
    expect(await screen.findByText(/توسط کاربر دیگری تغییر کرده/)).toBeInTheDocument();
  });

  it('validates the form locally and submits integer IRR values with an idempotency key', async () => {
    vi.mocked(listPromotions).mockResolvedValue({ items: [], total: 0 });
    render(<PromotionsPage />);
    expect(await screen.findByText(/کمپینی با این فیلترها وجود ندارد/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'کمپین جدید' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ایجاد کمپین' }));
    expect(await screen.findByText('نام کمپین را وارد کنید.')).toBeInTheDocument();
    expect(createPromotion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/نام کمپین/), { target: { value: 'تست' } });
    fireEvent.change(screen.getByLabelText(/درصد تخفیف/), { target: { value: '۱۰' } });
    fireEvent.change(screen.getByLabelText(/حداقل مبلغ سبد/), { target: { value: '۵۰۰۰۰۰' } });
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد کمپین' }));
    await waitFor(() => expect(createPromotion).toHaveBeenCalled());
    const [input, key] = vi.mocked(createPromotion).mock.calls[0]!;
    expect(input).toMatchObject({ name: 'تست', kind: 'PERCENTAGE', percentBp: 1000, minOrder: '500000', targets: [] });
    expect(key).toMatch(/^promo-/);
  });
});
