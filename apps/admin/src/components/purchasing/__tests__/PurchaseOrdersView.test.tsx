import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrdersView } from '../PurchaseOrdersView';

const mocks = vi.hoisted(() => ({
  user: { permissions: [] as string[] }, list: vi.fn(), history: vi.fn(), options: vi.fn(),
  create: vi.fn(), update: vi.fn(), transition: vi.fn(), get: vi.fn(), receipts: vi.fn(), receiptLocations: vi.fn(), receive: vi.fn(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/purchasing/purchase-orders-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/purchasing/purchase-orders-api')>('@/lib/purchasing/purchase-orders-api');
  return { ...actual, listPurchaseOrders: mocks.list, listPurchaseOrderHistory: mocks.history,
    listPurchaseOrderOptions: mocks.options, createPurchaseOrder: mocks.create,
    updatePurchaseOrder: mocks.update, transitionPurchaseOrder: mocks.transition, getPurchaseOrder: mocks.get,
    listPurchaseOrderReceipts: mocks.receipts, listPurchaseReceiptLocations: mocks.receiptLocations, receivePurchaseOrder: mocks.receive };
});

const order = {
  id: 'po-1', number: 'PO-123', supplierId: 'sup-1', warehouseId: 'wh-1', status: 'DRAFT', version: 0,
  expectedAt: null, notes: null, totalCost: '240000', createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
  items: [{ id: 'line-1', variantId: 'variant-1', sku: 'SKU-1', orderedQty: 2, receivedQty: 0, unitCost: '120000', lineCost: '240000' }],
};
describe('PurchaseOrdersView', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.permissions = ['purchasing.read', 'purchasing.manage', 'purchasing.approve'];
    mocks.list.mockResolvedValue({ items: [order], count: 1 });
    mocks.history.mockResolvedValue({ items: [{ id: 'audit-1', action: 'purchase-order.created', actorId: 'staff-1', createdAt: '2026-09-28T00:00:00.000Z' }], count: 1 });
    mocks.options.mockResolvedValue({ items: [], count: 0 });
    mocks.receipts.mockResolvedValue({ items: [], count: 0 });
    mocks.receiptLocations.mockResolvedValue({ items: [{ id: 'loc-1', code: 'A1', label: 'قفسهٔ A1' }], count: 1 });
  });
  it('fails closed without read permission', async () => {
    mocks.user.permissions = [];
    render(<PurchaseOrdersView />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    await waitFor(() => expect(mocks.list).not.toHaveBeenCalled());
  });
  it('lists the real API response and shows audited detail', async () => {
    render(<PurchaseOrdersView />);
    await screen.findByText('PO-123');
    expect(mocks.list).toHaveBeenCalledWith({ offset: 0, limit: 25 }, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    expect(await screen.findByText(/purchase-order.created/)).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledWith('po-1', expect.anything());
    expect(screen.getByRole('button', { name: 'تأیید سفارش' })).toBeInTheDocument();
  });
  it('hides all mutation actions for read-only staff', async () => {
    mocks.user.permissions = ['purchasing.read'];
    render(<PurchaseOrdersView />);
    await screen.findByText('PO-123');
    expect(screen.queryByRole('button', { name: 'سفارش جدید' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    expect(screen.queryByRole('button', { name: 'تأیید سفارش' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'لغو سفارش' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ثبت دریافت کالا' })).toBeNull();
  });
  it('shows persisted receipts and gates receiving by dedicated permission', async () => {
    mocks.user.permissions = ['purchasing.read', 'purchasing.receive'];
    mocks.list.mockResolvedValue({ items: [{ ...order, status: 'APPROVED', version: 1 }], count: 1 });
    mocks.receipts.mockResolvedValue({ items: [{ id: 'receipt-1', number: 'RC-1', purchaseOrderId: 'po-1', warehouseId: 'wh-1',
      externalReference: 'DEL-1', actorId: 'staff-1', receivedAt: '2026-09-29T00:00:00.000Z',
      lines: [{ id: 'receipt-line-1', purchaseOrderItemId: 'line-1', variantId: 'variant-1', locationId: 'loc-1', quantity: 1, movementId: 'movement-1' }] }], count: 1 });
    render(<PurchaseOrdersView />);
    await screen.findByText('PO-123');
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    expect(await screen.findByText(/DEL-1/)).toBeInTheDocument();
    expect(screen.getByText(/movement-1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت دریافت کالا' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ویرایش پیش‌نویس' })).toBeNull();
  });
  it('rejects an over-receipt in the operator form before issuing a mutation', async () => {
    mocks.user.permissions = ['purchasing.read', 'purchasing.receive'];
    mocks.list.mockResolvedValue({ items: [{ ...order, status: 'APPROVED', version: 1 }], count: 1 });
    render(<PurchaseOrdersView />);
    await screen.findByText('PO-123');
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت دریافت کالا' }));
    const dialog = screen.getByRole('dialog', { name: 'ثبت دریافت کالا برای PO-123' });
    fireEvent.change(screen.getByRole('textbox', { name: 'شمارهٔ حوالهٔ تأمین‌کننده' }), { target: { value: 'DEL-99' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'تعداد واقعی' }), { target: { value: '3' } });
    fireEvent.submit(dialog.querySelector('form')!);
    expect(dialog).toHaveTextContent('تعداد هر ردیف باید صحیح و از باقیماندهٔ سفارش بیشتر نباشد');
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it('filters draft orders at the server and offers a real create form', async () => {
    render(<PurchaseOrdersView />);
    await screen.findByText('PO-123');
    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس' }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith({ offset: 0, limit: 25, status: 'DRAFT' }, expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'سفارش جدید' }));
    expect(screen.getByRole('dialog', { name: 'سفارش خرید جدید' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /تأمین‌کننده/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /انبار مقصد/ })).toBeInTheDocument();
  });
});
