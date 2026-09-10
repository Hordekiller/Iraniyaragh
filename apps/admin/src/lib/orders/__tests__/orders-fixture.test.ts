import { describe, expect, it } from 'vitest';
import { OrdersFixtureApi } from '../orders-fixture';

describe('OrdersFixtureApi', () => {
  const api = new OrdersFixtureApi();

  it('lists all orders with default paging and metadata', async () => {
    const result = await api.listOrders({});
    expect(result.items.length).toBe(5);
    expect(result.meta).toEqual({ page: 1, perPage: 25, total: 5, pages: 1 });
  });

  it('filters by order, payment and fulfillment states independently', async () => {
    const byOrder = await api.listOrders({ orderStatus: 'COMPLETED' });
    expect(byOrder.items.every((o) => o.orderStatus === 'COMPLETED')).toBe(true);

    const byPayment = await api.listOrders({ paymentStatus: 'PAID' });
    expect(byPayment.items.every((o) => o.paymentStatus === 'PAID')).toBe(true);

    const combined = await api.listOrders({ orderStatus: 'COMPLETED', paymentStatus: 'PAID' });
    expect(combined.items.map((o) => o.orderNumber).sort()).toEqual(['IR-09-3764']);
  });

  it('searches against order number, customer name and mobile', async () => {
    const byNumber = await api.listOrders({ search: 'IR-10-4821' });
    expect(byNumber.items.map((o) => o.id)).toEqual(['ord-1001']);

    const byName = await api.listOrders({ search: 'مشتری نمونهٔ سه' });
    expect(byName.items.map((o) => o.id)).toEqual(['ord-1003']);

    const byMobile = await api.listOrders({ search: '09350000003' });
    expect(byMobile.items.map((o) => o.id)).toEqual(['ord-1003']);
  });

  it('trims and case-normalizes the search term', async () => {
    const byNumber = await api.listOrders({ search: '  IR-10-4821  ' });
    expect(byNumber.items.map((o) => o.id)).toEqual(['ord-1001']);
  });

  it('sorts by createdAt, updatedAt or totalRials ascending and descending', async () => {
    const asc = await api.listOrders({ sortBy: 'totalRials', sortDir: 'asc' });
    const totals = asc.items.map((o) => o.totalRials);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));

    const desc = await api.listOrders({ sortBy: 'totalRials', sortDir: 'desc' });
    const totalsDesc = desc.items.map((o) => o.totalRials);
    expect(totalsDesc).toEqual([...totalsDesc].sort((a, b) => b - a));
  });

  it('paginates and clamps out-of-range pages', async () => {
    const page = await api.listOrders({ perPage: 2, page: 2 });
    expect(page.items.length).toBe(2);
    expect(page.meta).toEqual({ page: 2, perPage: 2, total: 5, pages: 3 });

    const outOfRange = await api.listOrders({ perPage: 2, page: 99 });
    expect(outOfRange.items.length).toBe(1);
    expect(outOfRange.meta.page).toBe(3);
  });

  it('returns a full detail for a known order', async () => {
    const detail = await api.getOrder('ord-1001');
    expect(detail.orderNumber).toBe('IR-10-4821');
    expect(detail.lines.length).toBeGreaterThan(0);
    expect(detail.totalRials).toBe(detail.subtotalRials + detail.shippingRials);
    expect(detail.lines.every((line) => line.lineTotalRials === line.unitPriceRials * line.quantity)).toBe(true);
  });

  it('keeps the three lifecycles separate in the detail', async () => {
    const detail = await api.getOrder('ord-1004');
    expect(detail.orderStatus).toBe('CANCELLED');
    expect(detail.paymentStatus).toBe('REFUNDED');
    expect(detail.fulfillmentStatus).toBe('UNFULFILLED');
  });

  it('throws a user-facing error for an unknown order', async () => {
    await expect(api.getOrder('ord-missing')).rejects.toThrow('سفارش یافت نشد.');
  });
});