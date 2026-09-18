import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
} from "@prisma/client";
import type {
  AdminOrderActor,
  AdminOrderAddress,
  AdminOrderAuditEntry,
  AdminOrderDetail,
  AdminOrderDetailResponse,
  AdminOrderListResponse,
  AdminOrderSummary,
  AdminOrderTimelineEntry,
  CheckoutAddress,
  CustomerOrderDetailResponse,
  CustomerOrderListResponse,
  OrderDetail,
  OrderListMeta,
  OrderSummary,
  OrderTimelineEntry,
} from "@iranyaragh/contracts";
import { PrismaService } from "../../database/prisma.service";
import {
  AdminOrderListQueryDto,
  CustomerOrderListQueryDto,
} from "./order-read.dto";

const HISTORY_LIMIT = 100;

const customerListSelect = {
  id: true,
  number: true,
  status: true,
  subtotal: true,
  discount: true,
  shipping: true,
  grandTotal: true,
  reservationExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  payments: {
    select: { status: true },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
  _count: { select: { items: true, payments: true } },
  fulfillment: { select: { status: true } },
} satisfies Prisma.OrderSelect;

const adminListSelect = {
  ...customerListSelect,
  customer: {
    select: { id: true, firstName: true, lastName: true, mobile: true },
  },
} satisfies Prisma.OrderSelect;

const customerDetailSelect = {
  ...customerListSelect,
  addressSnapshot: true,
  shippingMethod: true,
  shippingMethodTitle: true,
  shippingPolicyRevision: true,
  pricePolicyRevision: true,
  items: {
    select: {
      variantId: true,
      sku: true,
      productTitle: true,
      variantTitle: true,
      quantity: true,
      unitPrice: true,
      total: true,
    },
    orderBy: [{ ordinal: "asc" as const }, { id: "asc" as const }],
    take: HISTORY_LIMIT + 1,
  },
  payments: {
    select: {
      id: true,
      status: true,
      amount: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: HISTORY_LIMIT + 1,
  },
  fulfillment: {
    select: { status: true, createdAt: true, updatedAt: true },
  },
} satisfies Prisma.OrderSelect;

const adminDetailSelect = {
  ...customerDetailSelect,
  customer: {
    select: { id: true, firstName: true, lastName: true, mobile: true },
  },
} satisfies Prisma.OrderSelect;

type CustomerListRow = Prisma.OrderGetPayload<{
  select: typeof customerListSelect;
}>;
type AdminListRow = Prisma.OrderGetPayload<{ select: typeof adminListSelect }>;
type CustomerDetailRow = Prisma.OrderGetPayload<{
  select: typeof customerDetailSelect;
}>;
type AdminDetailRow = Prisma.OrderGetPayload<{
  select: typeof adminDetailSelect;
}>;

type TransitionRow = {
  from: OrderStatus | PaymentStatus | FulfillmentStatus;
  to: OrderStatus | PaymentStatus | FulfillmentStatus;
  reason: string | null;
  requestId: string | null;
  createdAt: Date;
  actor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type TimelineResult = {
  customer: OrderTimelineEntry[];
  admin: AdminOrderTimelineEntry[];
  truncated: boolean;
};

@Injectable()
export class OrderReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listCustomerOrders(
    userId: string,
    query: CustomerOrderListQueryDto,
  ): Promise<CustomerOrderListResponse> {
    const page = query.page;
    const perPage = query.perPage;
    const where: Prisma.OrderWhereInput = {
      customer: { userId },
      ...(query.status ? { status: query.status } : {}),
    };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] = [
      { createdAt: query.sortDir },
      { id: query.sortDir },
    ];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: customerListSelect,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: {
        items: rows.map((row) => orderSummary(row)),
        meta: listMeta(page, perPage, total),
      },
    };
  }

  async getCustomerOrder(
    userId: string,
    orderId: string,
  ): Promise<CustomerOrderDetailResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customer: { userId } },
      select: customerDetailSelect,
    });
    if (!order) throw orderNotFound();

    const timeline = await this.loadTimeline(order.id);
    return {
      data: {
        order: customerOrderDetail(order, timeline),
      },
    };
  }

  async listAdminOrders(
    query: AdminOrderListQueryDto,
  ): Promise<AdminOrderListResponse> {
    const page = query.page;
    const perPage = query.perPage;
    const where = adminOrderWhere(query);
    const orderBy: Prisma.OrderOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortDir },
      { id: query.sortDir },
    ];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: adminListSelect,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: {
        items: rows.map((row) => adminOrderSummary(row)),
        meta: listMeta(page, perPage, total),
      },
    };
  }

  async getAdminOrder(orderId: string): Promise<AdminOrderDetailResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: adminDetailSelect,
    });
    if (!order) throw orderNotFound();

    const [timeline, auditRows] = await Promise.all([
      this.loadTimeline(order.id),
      this.prisma.auditLog.findMany({
        where: {
          entityType: { equals: "order", mode: "insensitive" },
          entityId: order.id,
        },
        select: {
          action: true,
          requestId: true,
          createdAt: true,
          actor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT + 1,
      }),
    ]);
    const auditTruncated = auditRows.length > HISTORY_LIMIT;
    const audit = auditRows
      .slice(0, HISTORY_LIMIT)
      .reverse()
      .map<AdminOrderAuditEntry>((row) => ({
        action: row.action,
        actor: actor(row.actor),
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      }));

    return {
      data: {
        order: adminOrderDetail(order, timeline, audit, auditTruncated),
      },
    };
  }

  private async loadTimeline(orderId: string): Promise<TimelineResult> {
    const select = {
      from: true,
      to: true,
      reason: true,
      requestId: true,
      createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true } },
    } as const;
    const [orders, payments, fulfillments] = await Promise.all([
      this.prisma.orderTransition.findMany({
        where: { orderId },
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT + 1,
      }),
      this.prisma.paymentTransition.findMany({
        where: { payment: { orderId } },
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT + 1,
      }),
      this.prisma.fulfillmentTransition.findMany({
        where: { fulfillment: { orderId } },
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT + 1,
      }),
    ]);
    const combined = [
      ...tagTransitions("ORDER", orders),
      ...tagTransitions("PAYMENT", payments),
      ...tagTransitions("FULFILLMENT", fulfillments),
    ].sort((left, right) => {
      const byTime =
        right.row.createdAt.getTime() - left.row.createdAt.getTime();
      return byTime || left.domain.localeCompare(right.domain);
    });
    const truncated = combined.length > HISTORY_LIMIT;
    const visible = combined.slice(0, HISTORY_LIMIT).reverse();

    return {
      truncated,
      customer: visible.map(({ domain, row }) => ({
        domain,
        from: row.from,
        to: row.to,
        createdAt: row.createdAt.toISOString(),
      })),
      admin: visible.map(({ domain, row }) => ({
        domain,
        from: row.from,
        to: row.to,
        reason: row.reason,
        actor: actor(row.actor),
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}

function adminOrderWhere(
  query: AdminOrderListQueryDto,
): Prisma.OrderWhereInput {
  const createdFrom = query.createdFrom
    ? new Date(query.createdFrom)
    : undefined;
  const createdTo = query.createdTo ? new Date(query.createdTo) : undefined;
  if (createdFrom && createdTo && createdFrom > createdTo) {
    throw new BadRequestException({
      code: "INVALID_REQUEST",
      message: "createdFrom must not be later than createdTo.",
    });
  }
  const search = query.search?.trim();
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus
      ? { payments: { some: { status: query.paymentStatus } } }
      : {}),
    ...(query.fulfillmentStatus
      ? { fulfillment: { is: { status: query.fulfillmentStatus } } }
      : {}),
    ...(createdFrom || createdTo
      ? {
          createdAt: {
            ...(createdFrom ? { gte: createdFrom } : {}),
            ...(createdTo ? { lte: createdTo } : {}),
          },
        }
      : {}),
    ...(search ? { number: { contains: search, mode: "insensitive" } } : {}),
  };
}

function listMeta(page: number, perPage: number, total: number): OrderListMeta {
  return {
    page,
    perPage,
    total,
    pages: Math.ceil(total / perPage),
  };
}

function orderSummary(row: CustomerListRow): OrderSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    payment: {
      latestStatus: row.payments[0]?.status ?? null,
      attemptCount: row._count.payments,
    },
    fulfillmentStatus: row.fulfillment?.status ?? null,
    itemCount: row._count.items,
    totals: {
      subtotal: money(row.subtotal),
      discount: money(row.discount),
      shipping: money(row.shipping),
      total: money(row.grandTotal),
    },
    reservationExpiresAt: row.reservationExpiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function adminOrderSummary(row: AdminListRow): AdminOrderSummary {
  return {
    ...orderSummary(row),
    customer: adminCustomer(row.customer),
  };
}

function customerOrderDetail(
  row: CustomerDetailRow,
  timeline: TimelineResult,
): OrderDetail {
  const paymentsTruncated = row.payments.length > HISTORY_LIMIT;
  const itemsTruncated = row.items.length > HISTORY_LIMIT;
  const visibleItems = row.items.slice(0, HISTORY_LIMIT);
  const visiblePayments = row.payments.slice(0, HISTORY_LIMIT).reverse();
  return {
    ...orderSummary(row),
    address: checkoutAddress(row.addressSnapshot),
    shippingMethod: {
      code: row.shippingMethod,
      title: row.shippingMethodTitle,
    },
    pricePolicyRevision: row.pricePolicyRevision,
    shippingPolicyRevision: row.shippingPolicyRevision,
    items: visibleItems.map((item) => ({
      variantId: item.variantId,
      sku: item.sku,
      productTitle: item.productTitle,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.total),
    })),
    payments: visiblePayments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      amount: money(payment.amount),
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    })),
    fulfillment: row.fulfillment
      ? {
          status: row.fulfillment.status,
          createdAt: row.fulfillment.createdAt.toISOString(),
          updatedAt: row.fulfillment.updatedAt.toISOString(),
        }
      : null,
    timeline: timeline.customer,
    truncation: {
      items: itemsTruncated,
      payments: paymentsTruncated,
      timeline: timeline.truncated,
    },
  };
}

function adminOrderDetail(
  row: AdminDetailRow,
  timeline: TimelineResult,
  audit: AdminOrderAuditEntry[],
  auditTruncated: boolean,
): AdminOrderDetail {
  const detail = customerOrderDetail(row, timeline);
  const { address: customerAddress, ...safeDetail } = detail;
  return {
    ...safeDetail,
    customer: adminCustomer(row.customer),
    address: adminAddress(customerAddress),
    timeline: timeline.admin,
    audit,
    truncation: {
      ...detail.truncation,
      audit: auditTruncated,
    },
  };
}

function money(amount: bigint): { amount: string; currency: "IRR" } {
  return { amount: amount.toString(), currency: "IRR" };
}

function checkoutAddress(value: Prisma.JsonValue): CheckoutAddress | null {
  if (!isRecord(value)) return null;
  const keys = [
    "provinceCode",
    "city",
    "address",
    "postalCode",
    "recipient",
    "mobile",
  ] as const;
  if (!keys.every((key) => typeof value[key] === "string")) return null;
  return {
    provinceCode: value.provinceCode as string,
    city: value.city as string,
    address: value.address as string,
    postalCode: value.postalCode as string,
    recipient: value.recipient as string,
    mobile: value.mobile as string,
  };
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function actor(
  value: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null,
): AdminOrderActor | null {
  if (!value) return null;
  const displayName = [value.firstName, value.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  return {
    id: value.id,
    displayNameMasked: displayName ? maskText(displayName) : null,
  };
}

function adminCustomer(value: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  mobile: string;
}): AdminOrderSummary["customer"] {
  const displayName = [value.firstName, value.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  return {
    id: value.id,
    displayNameMasked: displayName ? maskText(displayName) : null,
    mobileMasked: maskIdentifier(value.mobile, 5, 3),
  };
}

function adminAddress(value: CheckoutAddress | null): AdminOrderAddress | null {
  if (!value) return null;
  return {
    provinceCode: value.provinceCode,
    city: value.city,
    addressMasked: maskText(value.address),
    postalCodeMasked: maskIdentifier(value.postalCode, 3, 2),
    recipientMasked: maskText(value.recipient),
    mobileMasked: maskIdentifier(value.mobile, 5, 3),
  };
}

function maskText(value: string): string {
  const characters = [...value.trim()];
  return characters.length ? `${characters[0]}***` : "***";
}

function maskIdentifier(value: string, prefix: number, suffix: number): string {
  if (value.length <= prefix + suffix) return "*".repeat(value.length);
  return `${value.slice(0, prefix)}${"*".repeat(value.length - prefix - suffix)}${value.slice(-suffix)}`;
}

function tagTransitions<T extends TransitionRow>(
  domain: "ORDER" | "PAYMENT" | "FULFILLMENT",
  rows: T[],
): Array<{ domain: "ORDER" | "PAYMENT" | "FULFILLMENT"; row: T }> {
  return rows.map((row) => ({ domain, row }));
}

function orderNotFound(): NotFoundException {
  return new NotFoundException({
    code: "NOT_FOUND",
    message: "Order not found.",
  });
}
