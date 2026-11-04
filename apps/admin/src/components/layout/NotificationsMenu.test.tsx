import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsMenu } from './NotificationsMenu';
import * as api from '@/lib/notifications/api';

vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff-1' } }) }));
vi.mock('@/lib/notifications/api', async importOriginal => ({ ...(await importOriginal<typeof api>()), listNotifications: vi.fn(), readUnreadCount: vi.fn(), setNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

const item = { id: 'n1', kind: 'ORDER_CREATED', title: 'سفارش جدید', body: 'یک سفارش جدید ثبت شد (سفارش A-1)', href: '/orders/o1', read: false, createdAt: '2026-11-04T08:00:00.000Z' };

describe('admin NotificationsMenu', () => {
  beforeEach(() => {
    vi.mocked(api.readUnreadCount).mockReset().mockResolvedValue(1);
    vi.mocked(api.listNotifications).mockReset().mockResolvedValue({ items: [item], unreadCount: 1, nextCursor: null });
    vi.mocked(api.setNotificationRead).mockReset().mockResolvedValue({ ...item, read: true });
    vi.mocked(api.markAllNotificationsRead).mockReset().mockResolvedValue(0);
  });

  it('shows the real unread count, lists records with links and marks read', async () => {
    render(<NotificationsMenu />);
    const bell = await screen.findByRole('button', { name: /خوانده‌نشده/ });
    fireEvent.click(bell);
    expect(await screen.findByRole('link', { name: /سفارش جدید/ })).toHaveAttribute('href', '/orders/o1');
    fireEvent.click(screen.getByRole('button', { name: 'خوانده' }));
    await waitFor(() => expect(api.setNotificationRead).toHaveBeenCalledWith('n1', true));
  });

  it('shows an empty state without inventing rows', async () => {
    vi.mocked(api.readUnreadCount).mockResolvedValue(0);
    vi.mocked(api.listNotifications).mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null });
    render(<NotificationsMenu />);
    fireEvent.click(await screen.findByRole('button', { name: 'اعلان‌ها' }));
    expect(await screen.findByText('اعلانی وجود ندارد.')).toBeInTheDocument();
  });

  it('refuses off-site links from the server', () => {
    expect(api.safeHref('//evil.example/x')).toBeNull();
    expect(api.safeHref('https://evil.example')).toBeNull();
    expect(api.safeHref('/orders/1')).toBe('/orders/1');
  });
});
