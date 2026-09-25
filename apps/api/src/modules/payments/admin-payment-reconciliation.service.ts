import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminPaymentReconciliationResponse } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { PaymentVerificationService } from './payment-verification.service';

@Injectable()
export class AdminPaymentReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PaymentVerificationService) private readonly verification: PaymentVerificationService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  /** The provider is called only by the existing verifier, outside its settlement transaction. */
  async recheck(input: {
    paymentId: string;
    actorId: string;
    requestId: string;
  }): Promise<AdminPaymentReconciliationResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: {
        id: true, status: true, authority: true, referenceId: true,
        order: { select: { id: true, status: true } },
      },
    });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found.' });
    const unconfirmed = await this.prisma.outboxEvent.findUnique({
      where: { deduplicationKey: `payment-verification-unconfirmed:${payment.id}` },
      select: { id: true },
    });
    if (!unconfirmed) {
      throw new ConflictException({
        code: 'PAYMENT_STATE_CONFLICT',
        message: 'This payment has no unconfirmed verification record.',
      });
    }

    await this.audit.record({
      action: 'payment.reconciliation.requested',
      entityType: 'payment',
      entityId: payment.id,
      actorId: input.actorId,
      requestId: input.requestId,
    });

    // A prior command may have settled while the client's response was lost.
    // Replay the recorded truth without a second provider call or stock effect.
    if (payment.status === 'PAID' || payment.status === 'FAILED') {
      return {
        data: { reconciliation: {
          paymentId: payment.id,
          status: payment.status,
          outcome: 'REPLAY',
          referenceId: payment.referenceId,
          orderId: payment.order.id,
          orderStatus: payment.order.status,
        } },
      };
    }
    if (payment.status !== 'PENDING' || !payment.authority) {
      throw new ConflictException({
        code: 'PAYMENT_STATE_CONFLICT',
        message: 'Only an unconfirmed pending payment can be rechecked.',
      });
    }

    const { data: { verification } } = await this.verification.verify({
      authority: payment.authority,
      status: undefined,
      requestId: input.requestId,
    });
    return {
      data: {
        reconciliation: {
          paymentId: verification.paymentId,
          status: verification.status,
          outcome: verification.outcome,
          referenceId: verification.referenceId ?? null,
          orderId: verification.orderId,
          orderStatus: verification.orderStatus,
        },
      },
    };
  }
}
