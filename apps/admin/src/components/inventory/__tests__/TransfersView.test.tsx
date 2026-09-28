import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransfersView } from '../TransfersView';

const mocks = vi.hoisted(() => ({ user: { permissions: ['inventory.transfer'] }, listTransfers: vi.fn() }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/inventory/transfers-api', () => ({ listTransfers: mocks.listTransfers }));

const transfer = { id: 'tr-1', code: 'TRF-1', sourceWarehouseId: 'wh-1', targetWarehouseId: 'wh-2', status: 'DRAFT', version: 0, items: [{ id: 'line-1' }], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

describe('TransfersView', () => {
  beforeEach(() => { mocks.user = { permissions: ['inventory.transfer'] }; mocks.listTransfers.mockReset().mockResolvedValue({ items: [transfer], count: 1 }); });

  it('fails closed without transfer permission', () => {
    mocks.user = { permissions: ['inventory.read'] };
    render(<TransfersView />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listTransfers).not.toHaveBeenCalled();
  });

  it('renders real rows and applies bounded server-side filters', async () => {
    render(<TransfersView />);
    expect(await screen.findByRole('link', { name: 'TRF-1' })).toHaveAttribute('href', '/transfers/tr-1');
    fireEvent.change(screen.getByRole('textbox', { name: 'شناسه انبار مبدأ' }), { target: { value: 'wh-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(mocks.listTransfers).toHaveBeenLastCalledWith(expect.objectContaining({ sourceWarehouseId: 'wh-1', offset: 0, limit: 25 }), expect.any(AbortSignal)));
  });
});
