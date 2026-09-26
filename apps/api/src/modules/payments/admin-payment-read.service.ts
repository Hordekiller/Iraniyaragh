import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminPaymentDetailResponse,
  AdminPaymentListResponse,
  AdminPaymentSummary,
  AdminRefundRecord,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AdminPaymentListQueryDto } from './admin-payment-read.dto';

const HISTORY_LIMIT = 100;
const paymentSelect = {
  id: true,
  provider: true,
  amount: true,
  status: true,
  referenceId: true,
  gatewayEnvironment: true,
  refundedAmount: true,
  createdAt: true,
  updatedAt: true,
  order: { select: { id: true, number: true, status: true } },
} satisfies Prisma.PaymentSelect;

const refundSelect = {
  id: true,
  amount: true,
  status: true,
  gatewayReferenceId: true,
  reason: true,
  note: true,
  createdAt: true,
} satisfies Prisma.RefundSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;
type RefundRow = Prisma.RefundGetPayload<{ select: typeof refundSelect }>;

/** Money that can still be returned: the captured amount minus what was already refunded. */
export function remainingRefundable(row: {
  amount: bigint;
  refundedAmount: bigint;
  status: string;
}): bigint {
  if (row.status !== 'PAID' && row.status !== 'PARTIALLY_REFUNDED') return 0n;
  const remaining = row.amount - row.refundedAmount;
  return remaining > 0n ? remaining : 0n;
}

function refundRecord(row: RefundRow): AdminRefundRecord {
  return {
    refundId: row.id,
    amount: { amount: row.amount.toString(), currency: 'IRR' },
    status: row.status,
    gatewayReferenceId: row.gatewayReferenceId,
    reason: row.reason,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function summary(row: PaymentRow): AdminPaymentSummary {
  return {
    id: row.id,
    order: row.order,
    provider: row.provider,
    amount: { amount: row.amount.toString(), currency: 'IRR' },
    status: row.status,
    referenceId: row.referenceId,
    gatewayEnvironment: row.gatewayEnvironment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class AdminPaymentReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: AdminPaymentListQueryDto): Promise<AdminPaymentListResponse> {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? { order: { number: { contains: query.search.trim(), mode: 'insensitive' } } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data: {
        items: rows.map(summary),
        meta: {
          page: query.page,
          perPage: query.perPage,
          total,
          pages: Math.ceil(total / query.perPage),
        },
      },
    };
  }

  async get(id: string): Promise<AdminPaymentDetailResponse> {
    const row = await this.prisma.payment.findUnique({ where: { id }, select: paymentSelect });
    if (!row) throw new NotFoundException('Payment not found');
    const [transitions, unconfirmed, refunds] = await Promise.all([
      this.prisma.paymentTransition.findMany({
        where: { paymentId: id },
        select: { from: true, to: true, reason: true, requestId: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: HISTORY_LIMIT + 1,
      }),
      this.prisma.outboxEvent.findUnique({
        where: { deduplicationKey: `payment-verification-unconfirmed:${id}` },
        select: { id: true },
      }),
      this.prisma.refund.findMany({
        where: { paymentId: id },
        select: refundSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: HISTORY_LIMIT + 1,
      }),
    ]);
    const remaining = remainingRefundable(row);
    return {
      data: {
        payment: {
          ...summary(row),
          transitions: transitions.slice(0, HISTORY_LIMIT).map((transition) => ({
            ...transition,
            createdAt: transition.createdAt.toISOString(),
          })),
          transitionsTruncated: transitions.length > HISTORY_LIMIT,
          reconciliationEligible: row.status === 'PENDING' && Boolean(unconfirmed),
          refundedTotal: { amount: row.refundedAmount.toString(), currency: 'IRR' },
          remainingRefundable: { amount: remaining.toString(), currency: 'IRR' },
          refundEligible: remaining > 0n,
          refunds: refunds.slice(0, HISTORY_LIMIT).map(refundRecord),
          refundsTruncated: refunds.length > HISTORY_LIMIT,
        },
      },
    };
  }
}
