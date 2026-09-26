import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { AdminPaymentListQueryDto } from './admin-payment-read.dto';
import { AdminPaymentReadService } from './admin-payment-read.service';

const row = {
  id: 'payment-1', provider: 'zarinpal', amount: 123000n, refundedAmount: 23000n,
  status: 'PAID', referenceId: 'reference-1', gatewayEnvironment: 'sandbox',
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  updatedAt: new Date('2026-09-20T10:01:00.000Z'),
  order: { id: 'order-1', number: 'IR-1001', status: 'PAID' },
};

function setup() {
  const prisma = {
    payment: { findMany: vi.fn(async () => [row]), count: vi.fn(async () => 1), findUnique: vi.fn(async () => row) },
    paymentTransition: { findMany: vi.fn(async () => [{
      from: 'PENDING', to: 'PAID', reason: 'verified', requestId: 'request-1',
      createdAt: new Date('2026-09-20T10:01:00.000Z'),
    }]) },
    outboxEvent: { findUnique: vi.fn(async () => ({ id: 'unconfirmed-1' })) },
    refund: { findMany: vi.fn(async () => [{
      id: 'refund-1', amount: 23000n, status: 'RECORDED', gatewayReferenceId: 'ZR-1',
      reason: 'CANCELLED_SHIPMENT', note: null, createdAt: new Date('2026-09-21T10:00:00.000Z'),
    }]) },
    $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return { prisma, service: new AdminPaymentReadService(prisma as unknown as PrismaService) };
}

describe('AdminPaymentReadService', () => {
  it('filters only by payment status and order number, paginates, and excludes secrets', async () => {
    const { prisma, service } = setup();
    const query = Object.assign(new AdminPaymentListQueryDto(), { page: 2, perPage: 10, status: 'PAID', search: 'IR-1001' });
    const result = await service.list(query);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PAID', order: { number: { contains: 'IR-1001', mode: 'insensitive' } } },
      skip: 10, take: 10,
    }));
    expect(result.data.items[0]).toEqual(expect.objectContaining({
      id: 'payment-1', amount: { amount: '123000', currency: 'IRR' },
      order: { id: 'order-1', number: 'IR-1001', status: 'PAID' },
    }));
    expect(JSON.stringify(result)).not.toMatch(/authority|idempotency|fingerprint|correlationId/);
  });

  it('returns bounded state evidence without gateway authority', async () => {
    const { service, prisma } = setup();
    const result = await service.get('payment-1');
    expect(result.data.payment.transitions).toEqual([{
      from: 'PENDING', to: 'PAID', reason: 'verified', requestId: 'request-1',
      createdAt: '2026-09-20T10:01:00.000Z',
    }]);
    expect(prisma.paymentTransition.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
    expect(result.data.payment.reconciliationEligible).toBe(false);
    expect(prisma.refund.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { paymentId: 'payment-1' }, take: 101,
    }));
    expect(result.data.payment.refundedTotal).toEqual({ amount: '23000', currency: 'IRR' });
    expect(result.data.payment.remainingRefundable).toEqual({ amount: '100000', currency: 'IRR' });
    expect(result.data.payment.refundEligible).toBe(true);
    expect(result.data.payment.refunds).toEqual([{
      refundId: 'refund-1', amount: { amount: '23000', currency: 'IRR' }, status: 'RECORDED',
      gatewayReferenceId: 'ZR-1', reason: 'CANCELLED_SHIPMENT', note: null,
      createdAt: '2026-09-21T10:00:00.000Z',
    }]);
    expect(result.data.payment.refundsTruncated).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/authority|idempotency|fingerprint/);
  });

  it('marks a fully refunded payment as ineligible and reports nothing left to return', async () => {
    const { prisma, service } = setup();
    prisma.payment.findUnique.mockResolvedValueOnce({
      ...row, refundedAmount: row.amount, status: 'REFUNDED',
    } as never);
    const result = await service.get('payment-1');
    expect(result.data.payment.refundEligible).toBe(false);
    expect(result.data.payment.remainingRefundable).toEqual({ amount: '0', currency: 'IRR' });
  });

  it('reports the refund list as truncated when the history is longer than the bound', async () => {
    const { prisma, service } = setup();
    prisma.refund.findMany.mockResolvedValueOnce(
      Array.from({ length: 101 }, (_, index) => ({
        id: `refund-${index}`, amount: 1n, status: 'RECORDED', gatewayReferenceId: `ZR-${index}`,
        reason: 'OTHER', note: null, createdAt: new Date('2026-09-21T10:00:00.000Z'),
      })) as never,
    );
    const result = await service.get('payment-1');
    expect(result.data.payment.refunds).toHaveLength(100);
    expect(result.data.payment.refundsTruncated).toBe(true);
  });

  it('returns 404 for an unknown payment', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
