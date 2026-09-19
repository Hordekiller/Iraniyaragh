import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminDashboardResponse,
  DashboardStatusCount,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  TransferStatus,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import {
  FULFILLMENT_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  RESERVATION_STATUS_VALUES,
  TRANSFER_STATUS_VALUES,
  type AdminDashboardQueryDto,
} from './dashboard.dto';

const MAX_RANGE_MILLISECONDS = 90 * 24 * 60 * 60 * 1_000;

type StatusCountRow<TStatus extends string> = {
  status: TStatus;
  _count: { _all: number };
};

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSummary(
    query: AdminDashboardQueryDto,
  ): Promise<AdminDashboardResponse> {
    const range = parseRange(query);
    const generatedAt = new Date();

    // Keep each Prisma promise independently inferred before composing the transaction.
    // This also makes the fixed nine-query budget explicit and reviewable.
    const rangeOrdersQuery = this.prisma.order.aggregate({
      where: { createdAt: { gte: range.from, lt: range.toExclusive } },
      _count: { _all: true },
      _sum: { grandTotal: true },
    });
    const orderStatusesQuery = this.prisma.order.groupBy({
      by: ['status'],
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    const paymentStatusesQuery = this.prisma.payment.groupBy({
      by: ['status'],
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    const fulfillmentStatusesQuery = this.prisma.fulfillment.groupBy({
      by: ['status'],
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    const ordersWithoutPaymentAttemptsQuery = this.prisma.order.count({
      where: { payments: { none: {} } },
    });
    const ordersWithoutFulfillmentQuery = this.prisma.order.count({
      where: { fulfillment: { is: null } },
    });
    const zeroAvailableBalancesQuery = this.prisma.inventoryBalance.count({
      where: { available: 0 },
    });
    const reservationStatusesQuery = this.prisma.stockReservation.groupBy({
      by: ['status'],
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    const transferStatusesQuery = this.prisma.stockTransfer.groupBy({
      by: ['status'],
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });

    const [
      rangeOrders,
      orderStatuses,
      paymentStatuses,
      fulfillmentStatuses,
      ordersWithoutPaymentAttempts,
      ordersWithoutFulfillment,
      zeroAvailableBalances,
      reservationStatuses,
      transferStatuses,
    ] = await this.prisma.$transaction(
      [
        rangeOrdersQuery,
        orderStatusesQuery,
        paymentStatusesQuery,
        fulfillmentStatusesQuery,
        ordersWithoutPaymentAttemptsQuery,
        ordersWithoutFulfillmentQuery,
        zeroAvailableBalancesQuery,
        reservationStatusesQuery,
        transferStatusesQuery,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const reservationsByStatus = completeStatusCounts<ReservationStatus>(
      RESERVATION_STATUS_VALUES,
      reservationStatuses,
    );

    return {
      data: {
        summary: {
          generatedAt: generatedAt.toISOString(),
          presentationTimezone: 'Asia/Tehran',
          range: {
            createdFrom: range.from.toISOString(),
            createdToExclusive: range.toExclusive.toISOString(),
          },
          rangeMetrics: {
            ordersCreated: rangeOrders._count._all,
            grossOrderValue: {
              amount: (rangeOrders._sum.grandTotal ?? 0n).toString(),
              currency: 'IRR',
            },
          },
          commerceSnapshot: {
            ordersByStatus: completeStatusCounts<OrderStatus>(
              ORDER_STATUS_VALUES,
              orderStatuses,
            ),
            paymentAttemptsByStatus: completeStatusCounts<PaymentStatus>(
              PAYMENT_STATUS_VALUES,
              paymentStatuses,
            ),
            fulfillmentsByStatus: completeStatusCounts<FulfillmentStatus>(
              FULFILLMENT_STATUS_VALUES,
              fulfillmentStatuses,
            ),
            ordersWithoutPaymentAttempts,
            ordersWithoutFulfillment,
          },
          inventorySnapshot: {
            zeroAvailableBalances,
            activeReservations:
              reservationsByStatus.find(({ status }) => status === 'ACTIVE')
                ?.count ?? 0,
            reservationsByStatus,
            transfersByStatus: completeStatusCounts<TransferStatus>(
              TRANSFER_STATUS_VALUES,
              transferStatuses,
            ),
          },
        },
      },
    };
  }
}

function parseRange(query: AdminDashboardQueryDto): {
  from: Date;
  toExclusive: Date;
} {
  const from = new Date(query.createdFrom);
  const toExclusive = new Date(query.createdToExclusive);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
    throw invalidRange('Dashboard range must use valid ISO 8601 instants.');
  }
  if (from >= toExclusive) {
    throw invalidRange('createdFrom must be earlier than createdToExclusive.');
  }
  if (toExclusive.getTime() - from.getTime() > MAX_RANGE_MILLISECONDS) {
    throw invalidRange('Dashboard range must not exceed 90 days.');
  }
  return { from, toExclusive };
}

function invalidRange(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_REQUEST', message });
}

function completeStatusCounts<TStatus extends string>(
  statuses: readonly TStatus[],
  rows: Array<StatusCountRow<TStatus>>,
): DashboardStatusCount<TStatus>[] {
  const counts = new Map(rows.map((row) => [row.status, row._count._all]));
  return statuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}
