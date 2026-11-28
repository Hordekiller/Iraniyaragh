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
  it('edits shop slides and collections without touching homepage settings', async () => {
    render(<ShopSettingsPage />);
    await screen.findByLabelText('عنوان بخش');
    fireEvent.click(screen.getByRole('button', { name: 'افزودن اسلاید' }));
    fireEvent.change(screen.getByLabelText('عنوان', { exact: true }), { target: { value: 'فروش ویژه ابزار' } });
    fireEvent.change(screen.getByLabelText('متن جایگزین تصویر'), { target: { value: 'تصویر ابزار' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن بنر' }));
    fireEvent.click(screen.getByRole('button', { name: 'افزودن مجموعه' }));
    await screen.findByLabelText('جستجوی کالای منتشرشده');
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await waitFor(() => expect(saveShop).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveShop).mock.calls[0]?.[0]).toMatchObject({
      expectedVersion: 4,
      hero: [{ title: 'فروش ویژه ابزار', imageAlt: 'تصویر ابزار' }],
      banners: [{}],
      sections: [{ kind: 'newest' }, { kind: 'manual' }],
    });
  });
  it('reorders sections with the accessible controls and removes an optional section', async () => {
    vi.mocked(readShop).mockResolvedValueOnce({ ...config, sections: [
      config.sections[0]!, { ...config.sections[0]!, id: 'offers', kind: 'offers', title: 'پیشنهادها' },
    ] });
    render(<ShopSettingsPage />);
    await screen.findByRole('button', { name: 'جابه‌جایی پیشنهادها' });
    fireEvent.click(screen.getAllByRole('button', { name: 'انتقال به بالا' })[1]!);
    fireEvent.click(screen.getAllByRole('button', { name: /^حذف$/u })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await waitFor(() => expect(saveShop).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveShop).mock.calls[0]?.[0].sections.map(section => section.id)).toEqual(['offers']);
  });
  it('offers a retry after a failed settings read', async () => {
    vi.mocked(readShop).mockRejectedValueOnce(new Error('offline'));
    render(<ShopSettingsPage />);
    await screen.findByText('دریافت تنظیمات انجام نشد.');
    fireEvent.click(screen.getByRole('button', { name: 'دریافت دوبارهٔ تنظیمات' }));
    await screen.findByLabelText('عنوان بخش');
    expect(readShop).toHaveBeenCalledTimes(2);
  });
  it('updates section copy, visibility and count before publishing', async () => {
    render(<ShopSettingsPage />);
    await screen.findByLabelText('عنوان بخش');
    fireEvent.change(screen.getByLabelText('عنوان بخش'), { target: { value: 'تازه‌ها' } });
    fireEvent.change(screen.getByLabelText('توضیح بخش'), { target: { value: 'کالاهای تازه افزوده‌شده' } });
    fireEvent.change(screen.getByLabelText('تعداد نمایش'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('switch', { name: 'نمایش بخش' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await waitFor(() => expect(saveShop).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveShop).mock.calls[0]?.[0].sections[0]).toMatchObject({
      title: 'تازه‌ها', description: 'کالاهای تازه افزوده‌شده', limit: 6, enabled: false,
    });
  });
  it('supports section reordering by drag and drop', async () => {
    vi.mocked(readShop).mockResolvedValueOnce({ ...config, sections: [
      config.sections[0]!, { ...config.sections[0]!, id: 'offers', kind: 'offers', title: 'پیشنهادها' },
    ] });
    render(<ShopSettingsPage />);
    const handle = await screen.findByRole('button', { name: 'جابه‌جایی پیشنهادها' });
    const destination = screen.getByRole('button', { name: 'جابه‌جایی جدیدترین' }).closest('.MuiPaper-root')!;
    fireEvent.dragStart(handle);
    fireEvent.dragOver(destination);
    fireEvent.drop(destination);
    fireEvent.dragEnd(handle);
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await waitFor(() => expect(saveShop).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveShop).mock.calls[0]?.[0].sections.map(section => section.id)).toEqual(['offers', 'new']);
  });
});
