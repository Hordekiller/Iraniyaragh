import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorefrontContactsPage } from './StorefrontContactsPage';
import { readStorefrontContacts, saveStorefrontContacts } from '@/lib/settings/storefront-contacts-api';

const auth = vi.hoisted(() => ({ user: { userId: 'staff', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/storefront-contacts-api', () => ({ readStorefrontContacts: vi.fn(), saveStorefrontContacts: vi.fn() }));

describe('storefront contact settings', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readStorefrontContacts).mockReset().mockResolvedValue({ links: [], version: 0, updatedAt: null });
    vi.mocked(saveStorefrontContacts).mockReset().mockResolvedValue({ links: [], version: 1, updatedAt: new Date().toISOString() });
  });
  it('adds a channel, edits its link, and saves the list', async () => {
    render(<StorefrontContactsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن راه ارتباطی' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'نشانی کامل https' }), { target: { value: 'https://instagram.com/shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await screen.findByText('راه‌های ارتباطی ذخیره و منتشر شدند.');
    expect(saveStorefrontContacts).toHaveBeenCalledWith({ expectedVersion: 0, links: [expect.objectContaining({ channel: 'instagram', label: 'اینستاگرام', value: 'https://instagram.com/shop' })] });
  });
  it('removes a configured channel and publishes the shorter list', async () => {
    vi.mocked(readStorefrontContacts).mockResolvedValueOnce({ links: [{ id: 'ig', channel: 'instagram', label: 'اینستاگرام', value: 'https://instagram.com/shop' }], version: 2, updatedAt: null });
    render(<StorefrontContactsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'حذف' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره و انتشار' }));
    await screen.findByText('راه‌های ارتباطی ذخیره و منتشر شدند.');
    expect(saveStorefrontContacts).toHaveBeenCalledWith({ expectedVersion: 2, links: [] });
  });
  it('does not request settings without the permission', () => {
    auth.user.permissions = [];
    render(<StorefrontContactsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مدیریت تنظیمات لازم است.');
    expect(readStorefrontContacts).not.toHaveBeenCalled();
  });
});
