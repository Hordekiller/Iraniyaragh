import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogsView } from '../AuditLogsView';

const mocks = vi.hoisted(() => ({
  user: { permissions: [] as string[] },
  listAuditLogs: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('@/lib/audit/audit-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit/audit-api')>('@/lib/audit/audit-api');
  return { ...actual, listAuditLogs: mocks.listAuditLogs };
});

const entry = {
  id: 'log-1',
  actorId: 'staff-1',
  actorLabel: 'علی رضایی',
  action: 'order.paid',
  entityType: 'order',
  entityId: 'ord-123',
  before: { status: 'awaiting_payment' },
  after: { status: 'paid' },
  metadata: { method: 'zarinpal' },
  requestId: 'req-abc-123456',
  ipHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  createdAt: '2026-09-28T10:30:00.000Z',
};

const renderView = () => render(<AuditLogsView />);

describe('AuditLogsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.permissions = ['audit.read'];
    mocks.listAuditLogs.mockResolvedValue({ items: [entry], count: 1 });
  });

  it('blocks a principal without audit.read and never calls the API', async () => {
    mocks.user.permissions = [];
    renderView();
    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    await waitFor(() => expect(mocks.listAuditLogs).not.toHaveBeenCalled());
  });

  it('reads the real log with the bounded default page', async () => {
    renderView();
    await screen.findByText('پرداخت سفارش');
    expect(mocks.listAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 25 }),
      expect.anything(),
    );
  });

  it('submits the selected filters and resets paging', async () => {
    renderView();
    await screen.findByText('پرداخت سفارش');
    fireEvent.change(screen.getByLabelText('کنش'), { target: { value: 'payment.paid' } });
    fireEvent.change(screen.getByLabelText('شناسه موجودیت'), { target: { value: 'ord-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() =>
      expect(mocks.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payment.paid', entityId: 'ord-123', offset: 0, limit: 25 }),
        expect.anything(),
      ),
    );
  });

  it('opens details showing before/after state for the selected event', async () => {
    renderView();
    await screen.findByText('پرداخت سفارش');
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    expect(await screen.findByText(/awaiting_payment/)).toBeInTheDocument();
    expect(screen.getByText(/"status":\s*"paid"/)).toBeInTheDocument();
    expect(screen.getAllByText('علی رضایی').length).toBeGreaterThanOrEqual(2);
  });

  it('renders rows inside a captioned, accessible table', async () => {
    renderView();
    await screen.findByText('پرداخت سفارش');
    const table = screen.getByRole('table', { name: 'رویدادهای ممیزی' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText(/ord-123/)).toBeInTheDocument();
    expect(within(rows[1]).getByText('علی رضایی')).toBeInTheDocument();
  });

  it('surfaces a list failure with a retry that refetches', async () => {
    mocks.listAuditLogs.mockRejectedValueOnce(new Error('سرویس در دسترس نیست.'));
    renderView();
    expect(await screen.findByText('سرویس در دسترس نیست.')).toBeInTheDocument();
    mocks.listAuditLogs.mockResolvedValue({ items: [entry], count: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(screen.getByText('پرداخت سفارش')).toBeInTheDocument());
  });
});