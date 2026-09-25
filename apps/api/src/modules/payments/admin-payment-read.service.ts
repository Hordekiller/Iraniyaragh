import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminPaymentDetailResponse,
  AdminPaymentListResponse,
  AdminPaymentSummary,
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
  createdAt: true,
  updatedAt: true,
  order: { select: { id: true, number: true, status: true } },
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

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
    const transitions = await this.prisma.paymentTransition.findMany({
      where: { paymentId: id },
      select: { from: true, to: true, reason: true, requestId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_LIMIT + 1,
    });
    return {
      data: {
        payment: {
          ...summary(row),
          transitions: transitions.slice(0, HISTORY_LIMIT).map((transition) => ({
            ...transition,
            createdAt: transition.createdAt.toISOString(),
          })),
          transitionsTruncated: transitions.length > HISTORY_LIMIT,
        },
      },
    };
  }
}
