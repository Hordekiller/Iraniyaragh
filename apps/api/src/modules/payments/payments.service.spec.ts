import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/errors/app-error';
import { PaymentService } from './payments.service';
import { FakePaymentGateway, PaymentGateway } from './payment-gateway';

const PAYMENT = {
  id: 'pay-1',
  orderId: 'ord-1',
  provider: 'fake',
  amount: 1_000_000n,
  status: 'PENDING',
  authority: 'auth-1',
  referenceId: null,
  idempotencyKey: 'k',
};

type MockTx = {
  payment: { findFirst: vi.Mock; update: vi.Mock };
  order: { update: vi.Mock };
};

type MockPrisma = { $transaction: vi.Mock };

function makePrisma(): { prisma: MockPrisma; tx: MockTx } {
  const tx: MockTx = {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    order: {
      update: vi.fn(),
    },
  };
  const prisma: MockPrisma = {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(tx)),
  };
  return { prisma, tx };
}

function makeService(prisma: MockPrisma, gateway: PaymentGateway) {
  return new PaymentService(prisma as unknown as never, gateway);
}

describe('PaymentService.verify', () => {
  it('replays idempotently when already PAID without calling the gateway', async () => {
    const { prisma, tx } = makePrisma();
    tx.payment.findFirst.mockResolvedValue({
      ...PAYMENT,
      status: 'PAID',
      order: { status: 'PAID', payments: [] },
    });
    const gateway = { verifyPayment: vi.fn() };
    const service = makeService(prisma, gateway as unknown as PaymentGateway);

    const result = await service.verify('auth-1');

    expect(result).toMatchObject({ idempotentReplay: true, status: 'PAID' });
    expect(gateway.verifyPayment).not.toHaveBeenCalled();
  });

  it('rejects a server-side amount mismatch and marks the payment FAILED', async () => {
    const { prisma, tx } = makePrisma();
    tx.payment.findFirst.mockResolvedValue({
      ...PAYMENT,
      order: { status: 'PENDING_PAYMENT', payments: [] },
    });
    tx.payment.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...PAYMENT, ...data }),
    );
    const gateway = {
      verifyPayment: vi.fn().mockResolvedValue({
        success: true,
        status: 'PAID',
        amount: 500_000, // does not match expected 1,000,000
        referenceId: 'ref-x',
      }),
    };
    const service = makeService(prisma, gateway as unknown as PaymentGateway);

    await expect(service.verify('auth-1')).rejects.toThrow(AppError);
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', referenceId: 'ref-x' }) }),
    );
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('marks payment and order PAID on a successful verification', async () => {
    const { prisma, tx } = makePrisma();
    tx.payment.findFirst.mockResolvedValue({
      ...PAYMENT,
      order: { status: 'PENDING_PAYMENT', payments: [] },
    });
    tx.payment.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...PAYMENT, ...data }),
    );
    tx.order.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: PAYMENT.orderId, ...data }),
    );
    const gateway = new FakePaymentGateway();
    const service = makeService(prisma, gateway);

    const result = await service.verify('auth-1');

    expect(result.status).toBe('PAID');
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });
});
