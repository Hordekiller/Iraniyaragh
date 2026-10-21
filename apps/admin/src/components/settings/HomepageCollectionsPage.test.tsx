import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageCollectionsPage } from './HomepageCollectionsPage';
import { readHomepageCollections, saveHomepageCollections } from '@/lib/settings/homepage-collections-api';

const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/homepage-collections-api', () => ({ readHomepageCollections: vi.fn(), saveHomepageCollections: vi.fn() }));

const categoryRows = [
  ...Array.from({ length: 5 }, (_, index) => ({ id: `root-${index}`, name: `دسته ${index}`, slug: `root-${index}`, parentId: null, productCount: 3 - index })),
  { id: 'hinges', name: 'لولا', slug: 'hinges', parentId: 'root-0', productCount: 2 },
];
const config = { version: 2, updatedAt: null, sections: Array.from({ length: 5 }, (_, index) => ({ categoryId: `root-${index}`, sortBy: 'NEWEST' as const })) };

describe('homepage category carousel settings', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readHomepageCollections).mockReset().mockResolvedValue({ config, categories: categoryRows });
    vi.mocked(saveHomepageCollections).mockReset().mockResolvedValue({ ...config, version: 3 });
  });

  it('loads five parent categories, excludes subcategories and saves choices with version and idempotency', async () => {
    render(<HomepageCollectionsPage />);
    expect(await screen.findByText('دسته‌بندی‌های قابل نمایش را انتخاب و ترتیب و معیار هر کاروسل را تعیین کنید.')).toBeInTheDocument();
    expect(screen.getByText(/لغوها و مرجوعی ثبت‌شده از رتبه کم می‌شوند/)).toBeInTheDocument();
    expect(screen.getByText('بخش 1')).toBeInTheDocument();
    expect(screen.getByText('بخش 5')).toBeInTheDocument();
    expect(screen.queryByText('لولا')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ چیدمان' }));
    await screen.findByText('چیدمان صفحهٔ اصلی ذخیره شد.');
    expect(saveHomepageCollections).toHaveBeenCalledWith({ expectedVersion: 2, sections: config.sections }, expect.stringMatching(/^homepage-collections-/));
  });

  it('does not read or write settings when the operator lacks settings.manage', () => {
    auth.user.permissions = [];
    render(<HomepageCollectionsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مدیریت تنظیمات لازم است.');
    expect(readHomepageCollections).not.toHaveBeenCalled();
    expect(saveHomepageCollections).not.toHaveBeenCalled();
  });

  it('keeps the same command key and payload after an ambiguous save result', async () => {
    vi.mocked(saveHomepageCollections).mockRejectedValueOnce(new Error('network unavailable'));
    render(<HomepageCollectionsPage />);
    await screen.findByText('بخش 1');
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ چیدمان' }));
    await screen.findByText(/نتیجهٔ ذخیره مشخص نیست/);
    fireEvent.click(screen.getByRole('button', { name: 'بررسی و تکرار همان ذخیره' }));
    await screen.findByText('چیدمان صفحهٔ اصلی ذخیره شد.');
    expect(vi.mocked(saveHomepageCollections).mock.calls[1]).toEqual(vi.mocked(saveHomepageCollections).mock.calls[0]);
  });
});
