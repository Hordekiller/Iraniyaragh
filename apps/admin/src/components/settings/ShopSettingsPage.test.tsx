import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopSettingsPage, moveItem } from './ShopSettingsPage';
import { listAssets, readShop, saveShop } from '@/lib/settings/shop-api';
const auth = vi.hoisted(() => ({ user: { userId: 'staff', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/shop-api', () => ({ readShop: vi.fn(), saveShop: vi.fn(), listAssets: vi.fn() }));
vi.mock('@/lib/catalog/catalog-api', () => ({ listCategories: async () => [], listBrands: async () => [], createIdempotencyKey: () => 'shop-command-key-123' }));
const config = { version: 4, updatedAt: null, hero: [], banners: [], categoryIds: [], brandIds: [], sections: [{ id: 'new', kind: 'newest' as const, title: 'جدیدترین', description: '', enabled: true, limit: 8, categoryId: null, productIds: [] }] };
beforeEach(() => {
  auth.user.permissions = ['settings.manage'];
  vi.mocked(readShop).mockReset().mockResolvedValue(config);
  vi.mocked(saveShop).mockReset().mockResolvedValue({ ...config, version: 5 });
  vi.mocked(listAssets).mockReset().mockResolvedValue([]);
});
describe('shop editor', () => {
  it('requires settings permission before loading', () => {
    auth.user.permissions = []; render(<ShopSettingsPage />);
    expect(readShop).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('retains the exact command after an uncertain result and saves the separate version', async () => {
    vi.mocked(saveShop).mockRejectedValueOnce(new Error('network'));
    render(<ShopSettingsPage />);
    await screen.findByLabelText('عنوان بخش');
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await screen.findByRole('button', { name: 'پیگیری ذخیرهٔ قبلی' });
    expect(screen.getByLabelText('عنوان بخش')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'پیگیری ذخیرهٔ قبلی' }));
    await waitFor(() => expect(saveShop).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveShop).mock.calls[0]).toEqual(vi.mocked(saveShop).mock.calls[1]);
    expect(vi.mocked(saveShop).mock.calls[0]?.[0].expectedVersion).toBe(4);
    await screen.findByText('تنظیمات فروشگاه ذخیره شد.');
  });
  it('uses the same bounded reorder operation for drag and keyboard buttons', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
