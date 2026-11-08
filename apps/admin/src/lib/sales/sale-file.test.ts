import { describe, expect, it } from 'vitest';
import { deriveSaleFile, type SaleFileInput } from './sale-file';

const all = { manage: true, issue: true, publish: true };
const base: SaleFileInput = { orderStatus: 'PAID', paymentStatus: 'PAID', fulfillmentStatus: 'PENDING', draft: null, document: null, published: null, can: all };
const step = (input: SaleFileInput, key: string) => deriveSaleFile(input).steps.find((item) => item.key === key)!;

describe('deriveSaleFile', () => {
  it('always lists the four steps in order and the order itself is done', () => {
    const { steps } = deriveSaleFile(base);
    expect(steps.map((item) => item.key)).toEqual(['order', 'invoice', 'payment', 'delivery']);
    expect(steps[0]!.state).toBe('done');
  });

  it('offers to create the first draft, only to staff who may manage invoices', () => {
    expect(step(base, 'invoice')).toMatchObject({ state: 'current', action: { kind: 'create-draft' } });
    const noManage = step({ ...base, can: { ...all, manage: false } }, 'invoice');
    expect(noManage.action).toBeUndefined();
    expect(noManage.detail).toContain('دسترسی');
  });

  it('sends an open draft to the draft page, and a cancelled draft is not a draft to continue', () => {
    expect(step({ ...base, draft: { id: 'd/1', state: 'DRAFT' } }, 'invoice').action).toEqual({ kind: 'link', label: 'ادامه و صدور فاکتور', href: '/invoices/drafts/d%2F1' });
    expect(step({ ...base, draft: { id: 'd1', state: 'DRAFT' }, can: { ...all, issue: false } }, 'invoice').action).toMatchObject({ label: 'مشاهدهٔ پیش‌فاکتور' });
    expect(step({ ...base, draft: { id: 'd1', state: 'CANCELLED' } }, 'invoice').action).toEqual({ kind: 'create-draft' });
  });

  it('asks to publish an issued invoice and is done only once it is published', () => {
    const document = { id: 'doc1', number: 'IRY-2026-000001' };
    expect(step({ ...base, document, published: false }, 'invoice')).toMatchObject({ state: 'current', action: { label: 'انتشار برای مشتری', href: '/invoices/documents/doc1' } });
    expect(step({ ...base, document, published: false, can: { ...all, publish: false } }, 'invoice').detail).toContain('انتشار فاکتور');
    expect(step({ ...base, document, published: true }, 'invoice').state).toBe('done');
  });

  it('never calls an invoice published when the publication state is unknown', () => {
    const unknown = step({ ...base, document: { id: 'doc1', number: 'N' }, published: null }, 'invoice');
    expect(unknown.detail).toContain('بارگذاری نشد');
    expect(unknown.detail).not.toContain('منتشر شده است');
  });

  it('blocks invoicing for orders the server cannot invoice', () => {
    for (const orderStatus of ['CANCELLED', 'RETURNED', 'DRAFT'] as const) expect(step({ ...base, orderStatus }, 'invoice').state).toBe('blocked');
    // An already issued invoice stays visible even if the order later changed.
    expect(step({ ...base, orderStatus: 'RETURNED', document: { id: 'd', number: 'N' }, published: true }, 'invoice').state).toBe('done');
  });

  it('shows payment done only when the server order status says paid or credit-approved', () => {
    expect(step({ ...base, orderStatus: 'PAID' }, 'payment').state).toBe('done');
    expect(step({ ...base, orderStatus: 'CREDIT_APPROVED' }, 'payment').state).toBe('done');
    // A PAID payment row on a still-pending order is not enough to call it paid.
    expect(step({ ...base, orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PAID' }, 'payment').state).toBe('current');
  });

  it('describes a pending order by the latest payment attempt', () => {
    const pending = (paymentStatus: SaleFileInput['paymentStatus']) => step({ ...base, orderStatus: 'PENDING_PAYMENT', paymentStatus }, 'payment');
    expect(pending(null).detail).toContain('هنوز پرداخت را شروع نکرده');
    expect(pending('PENDING').detail).toContain('تا تأیید سرور');
    expect(pending('FAILED').detail).toContain('ناموفق');
    expect(step({ ...base, orderStatus: 'CANCELLED' }, 'payment').state).toBe('blocked');
  });

  it('follows fulfilment: upcoming while unpaid, current while moving, done when delivered', () => {
    expect(step({ ...base, orderStatus: 'PENDING_PAYMENT', fulfillmentStatus: null }, 'delivery').state).toBe('upcoming');
    expect(step({ ...base, fulfillmentStatus: 'SHIPPED' }, 'delivery').state).toBe('current');
    expect(step({ ...base, fulfillmentStatus: 'DELIVERED' }, 'delivery').state).toBe('done');
    expect(step({ ...base, fulfillmentStatus: 'RETURNED' }, 'delivery').state).toBe('blocked');
  });

  it('points the next step at the first current step that has an action', () => {
    expect(deriveSaleFile(base).next?.key).toBe('invoice');
    const done = deriveSaleFile({ ...base, fulfillmentStatus: 'DELIVERED', document: { id: 'd', number: 'N' }, published: true });
    expect(done.next).toBeNull();
  });
});
