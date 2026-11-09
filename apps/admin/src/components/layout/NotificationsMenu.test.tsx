import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsMenu } from './NotificationsMenu';
import * as api from '@/lib/notifications/api';

vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff-1' } }) }));
const session = vi.hoisted(() => ({ token: 'opaque-token' as string | null, recover: vi.fn(async () => 'fresh') }));
vi.mock('@/lib/auth/token-store', () => ({ getAccessToken: () => session.token }));
vi.mock('@/lib/api/client', () => ({ recoverApiSession: session.recover }));
vi.mock('@/lib/notifications/api', async importOriginal => ({ ...(await importOriginal<typeof api>()), listNotifications: vi.fn(), readUnreadCount: vi.fn(), setNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

const item = { id: 'n1', kind: 'ORDER_CREATED', title: 'سفارش جدید', body: 'یک سفارش جدید ثبت شد (سفارش A-1)', href: '/orders/o1', read: false, createdAt: '2026-11-04T08:00:00.000Z' };

describe('admin NotificationsMenu', () => {
  beforeEach(() => {
    session.token = 'opaque-token';
    session.recover.mockReset().mockResolvedValue('fresh');
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

  it('does not poll before an access token exists', async () => {
    session.token = null;
    render(<NotificationsMenu />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(api.readUnreadCount).not.toHaveBeenCalled();
  });

  it('renews an expired token through shared recovery instead of sending a 401', async () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '');
    session.token = `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) - 30 })}.sig`;
    render(<NotificationsMenu />);
    await waitFor(() => expect(api.readUnreadCount).toHaveBeenCalled());
    expect(session.recover).toHaveBeenCalledTimes(1);
    expect(session.recover.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(api.readUnreadCount).mock.invocationCallOrder[0]!);
  });

  it('skips the poll when renewal fails', async () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '');
    session.token = `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) - 30 })}.sig`;
    session.recover.mockRejectedValue(new Error('revoked'));
    render(<NotificationsMenu />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(api.readUnreadCount).not.toHaveBeenCalled();
  });

  it('refuses off-site links from the server', () => {
    expect(api.safeHref('//evil.example/x')).toBeNull();
    expect(api.safeHref('https://evil.example')).toBeNull();
    expect(api.safeHref('/orders/1')).toBe('/orders/1');
  });
});
