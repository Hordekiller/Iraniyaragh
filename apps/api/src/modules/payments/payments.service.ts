import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '../../common/errors/app-error';
import { toRialNumber } from '../../common/money/money';
import { withSerializableRetry } from '../../common/prisma/transaction-retry';
import { PrismaService } from '../../database/prisma.service';
import { guardTransition, ORDER_TRANSITIONS, PAYMENT_TRANSITIONS } from '../../common/domain/state-machine';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async initiate(orderId: string) {
    return withSerializableRetry(this.prisma, async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found.', 404);

      // Server-side amount: never accepted from the client.
      const amount = order.grandTotal;
      if (amount <= 0n) {
        throw new AppError(ErrorCodes.PAYMENT_MISMATCH, 'Cannot initiate payment for a zero-amount order.', 409);
      }

      // Reject initiating payment on an order that cannot transition to PAID
      // (e.g. already-paid or cancelled semantic states are protected).
      if (order.status === 'PAID' || order.status === 'CANCELLED') {
        throw new AppError(ErrorCodes.PAYMENT_STATE_CONFLICT, `Order is not payable (${order.status}).`, 409);
      }

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: this.gateway.provider,
          amount,
          status: 'PENDING',
          idempotencyKey: `pay-${order.id}-${Date.now()}`,
        },
      });

      const prepared = await this.gateway.createPayment({
        paymentId: payment.id,
        orderNumber: order.number,
        amount: toRialNumber(payment.amount) ?? 0,
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { authority: prepared.authority },
      });

      return {
        paymentId: payment.id,
        authority: prepared.authority,
        redirectUrl: prepared.redirectUrl,
        amount: toRialNumber(payment.amount) ?? 0,
      };
    });
  }

  async verify(authority: string) {
    return withSerializableRetry(this.prisma, async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { authority },
        include: { order: { include: { payments: true } } },
      });
      if (!payment) throw new AppError(ErrorCodes.NOT_FOUND, 'Payment authority not found.', 404);

      // Idempotency: an already-verified payment is returned without re-applying.
      if (payment.status === 'PAID') {
        return { paymentId: payment.id, status: 'PAID', idempotentReplay: true };
      }

      const expected = payment.amount;
      const result = await this.gateway.verifyPayment({
        authority,
        expectedAmount: toRialNumber(expected) ?? 0,
      });

      if (!result.success || result.status !== 'PAID') {
        const failed = await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', ...(result.referenceId ? { referenceId: result.referenceId } : {}) },
        });
        return { paymentId: failed.id, status: failed.status };
      }

      // Server-side amount check: the amount must match the order amount.
      const reported = result.amount ?? 0;
      if (reported !== toRialNumber(expected)) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', referenceId: result.referenceId },
        });
        throw new AppError(
          ErrorCodes.PAYMENT_MISMATCH,
          `Payment amount mismatch: expected ${toRialNumber(expected)} Rial, got ${reported} Rial.`,
          409,
        );
      }

      const nextPayStatus = guardTransition<PaymentStatus>(
        payment.status,
        PaymentStatus.PAID,
        PAYMENT_TRANSITIONS as unknown as Record<PaymentStatus, readonly PaymentStatus[]>,
        ErrorCodes.PAYMENT_STATE_CONFLICT,
      );
      const paid = await tx.payment.update({
        where: { id: payment.id },
        data: { status: nextPayStatus, referenceId: result.referenceId },
      });

      // Transition the order lifecycle PENDING_PAYMENT -> PAID.
      const allowed = ORDER_TRANSITIONS as unknown as Record<
        OrderStatus,
        readonly OrderStatus[]
      >;
      const nextOrderStatus = guardTransition<OrderStatus>(
        payment.order.status,
        OrderStatus.PAID,
        allowed,
      );
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: nextOrderStatus },
      });

      return { paymentId: paid.id, status: paid.status };
    });
  }
}
