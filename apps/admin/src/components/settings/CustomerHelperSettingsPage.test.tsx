import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerHelperSettingsPage } from './CustomerHelperSettingsPage';
import { readStorefrontHelper, saveStorefrontHelper } from '@/lib/settings/storefront-helper-api';

const auth = vi.hoisted(() => ({ user: { userId: 'operator', permissions: ['settings.manage'] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/settings/storefront-helper-api', () => ({ readStorefrontHelper: vi.fn(), saveStorefrontHelper: vi.fn() }));

describe('customer helper switch', () => {
  beforeEach(() => {
    auth.user.permissions = ['settings.manage'];
    vi.mocked(readStorefrontHelper).mockReset().mockResolvedValue({ enabled: true, version: 0, updatedAt: null });
    vi.mocked(saveStorefrontHelper).mockReset().mockResolvedValue({ enabled: false, version: 1, updatedAt: '2026-11-04T10:00:00.000Z' });
  });

  it('shows the default, turns the helper off with the expected version and confirms', async () => {
    render(<CustomerHelperSettingsPage />);
    const toggle = await screen.findByRole('switch', { name: 'نمایش راهنمای تعاملی برای کاربران' });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/پیش‌فرض: روشن/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیره' })).toBeDisabled();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await screen.findByText('راهنمای مشتری برای کاربران خاموش شد.');
    expect(saveStorefrontHelper).toHaveBeenCalledWith({ expectedVersion: 0, enabled: false });
  });

  it('does not claim success when saving fails', async () => {
    vi.mocked(saveStorefrontHelper).mockRejectedValue(new Error('network'));
    render(<CustomerHelperSettingsPage />);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await screen.findByText(/تنظیم تأیید نشد/);
    expect(screen.queryByText(/خاموش شد/)).toBeNull();
  });

  it('does not read or write without settings.manage', () => {
    auth.user.permissions = [];
    render(<CustomerHelperSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('مجوز مدیریت تنظیمات لازم است.');
    expect(readStorefrontHelper).not.toHaveBeenCalled();
  });
});
