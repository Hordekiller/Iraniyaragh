import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { PaymentVerificationService } from './payment-verification.service';
import { AdminPaymentReconciliationService } from './admin-payment-reconciliation.service';

const payment = {
  id: 'payment-1', status: 'PENDING', authority: 'gateway-authority', referenceId: null,
  order: { id: 'order-1', status: 'PENDING_PAYMENT' },
};
const verification = {
  paymentId: 'payment-1', status: 'PAID', outcome: 'VERIFIED', referenceId: 'reference-1',
  authority: 'gateway-authority', redirectUrl: 'never-public', orderId: 'order-1', orderStatus: 'PAID',
};
const input = { paymentId: 'payment-1', actorId: 'staff-1', requestId: 'request-1' };

function setup() {
  const prisma = {
    payment: { findUnique: vi.fn(async () => payment) },
    outboxEvent: { findUnique: vi.fn(async () => ({ id: 'event-1' })) },
  };
  const verifier = { verify: vi.fn(async () => ({ data: { verification } })) };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new AdminPaymentReconciliationService(
    prisma as unknown as PrismaService,
    verifier as unknown as PaymentVerificationService,
    audit as unknown as AuditLogService,
  );
  return { prisma, verifier, audit, service };
}

describe('AdminPaymentReconciliationService', () => {
  it('rechecks only a recorded ambiguous payment and omits authority from its response', async () => {
    const { service, verifier, audit, prisma } = setup();
    const result = await service.recheck(input);
    expect(prisma.outboxEvent.findUnique).toHaveBeenCalledWith({
      where: { deduplicationKey: 'payment-verification-unconfirmed:payment-1' },
      select: { id: true },
    });
    expect(verifier.verify).toHaveBeenCalledWith({
      authority: 'gateway-authority', status: undefined, requestId: 'request-1',
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'payment.reconciliation.requested', actorId: 'staff-1', requestId: 'request-1',
    }));
    expect(result.data.reconciliation).toMatchObject({ paymentId: 'payment-1', status: 'PAID', outcome: 'VERIFIED' });
    expect(JSON.stringify(result)).not.toMatch(/authority|redirectUrl/);
  });

  it('rejects a missing payment or missing unconfirmed evidence before provider access', async () => {
    const { service, prisma, verifier } = setup();
    prisma.payment.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.recheck(input)).rejects.toBeInstanceOf(NotFoundException);
    prisma.outboxEvent.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.recheck(input)).rejects.toBeInstanceOf(ConflictException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('replays terminal recorded truth without a second gateway call', async () => {
    const { service, prisma, verifier } = setup();
    prisma.payment.findUnique.mockResolvedValueOnce({
      ...payment, status: 'PAID', referenceId: 'reference-1', order: { id: 'order-1', status: 'CANCELLED' },
    });
    const result = await service.recheck(input);
    expect(result.data.reconciliation).toMatchObject({ status: 'PAID', outcome: 'REPLAY', orderStatus: 'CANCELLED' });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('does not claim success when gateway is unavailable', async () => {
    const { service, verifier } = setup();
    verifier.verify.mockRejectedValueOnce(new ServiceUnavailableException('gateway unavailable'));
    await expect(service.recheck(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
