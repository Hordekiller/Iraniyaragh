import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminShipmentAddress,
  AdminShipmentCustomer,
  AdminShipmentDetail,
  AdminShipmentDetailResponse,
  AdminShipmentEvent,
  AdminShipmentEventKind,
  AdminShipmentListResponse,
  AdminShipmentSummary,
  FulfillmentStatus,
  OrderListMeta,
} from '@iranyaragh/contracts';
import { maskIdentifier, maskText } from '../../common/masking';
import { PrismaService } from '../../database/prisma.service';
import { AdminShipmentListQueryDto } from './shipment-read.dto';
import { staffDeliveryProofReference } from './shipment-command-utils';

const listSelect = {
  id: true,
  orderId: true,
  carrier: true,
  trackingCode: true,
  dispatchedAt: true,
  addressSnapshot: true,
  fulfillment: { select: { status: true } },
  order: {
    select: {
      number: true,
      customer: {
        select: { id: true, firstName: true, lastName: true, mobile: true },
      },
    },
  },
  lines: {
    select: {
      orderItemId: true,
      quantity: true,
      orderItem: {
        select: {
          sku: true,
          productTitle: true,
          variantTitle: true,
        },
      },
    },
    orderBy: { orderItemId: 'asc' as const },
  },
} satisfies Prisma.ShipmentSelect;

type ListRow = Prisma.ShipmentGetPayload<{ select: typeof listSelect }>;

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The address snapshot is the exact address the courier received, so it is
 * projected field by field and masked; a malformed legacy snapshot degrades to
 * null instead of leaking an unvalidated JSON blob to the staff UI.
 */
function shipmentAddress(
  value: Prisma.JsonValue,
): AdminShipmentAddress | null {
  if (!isRecord(value)) return null;
  const keys = [
    'provinceCode',
    'city',
    'address',
    'postalCode',
    'recipient',
    'mobile',
  ] as const;
  if (!keys.every((key) => typeof value[key] === 'string')) return null;
  return {
    provinceCode: value.provinceCode as string,
    city: value.city as string,
    addressMasked: maskText(value.address as string),
    postalCodeMasked: maskIdentifier(value.postalCode as string, 3, 2),
    recipientMasked: maskText(value.recipient as string),
    mobileMasked: maskIdentifier(value.mobile as string, 5, 3),
  };
}

function shipmentCustomer(
  value: { id: string; firstName: string | null; lastName: string | null; mobile: string },
): AdminShipmentCustomer {
  const displayName = [value.firstName, value.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return {
    id: value.id,
    displayNameMasked: displayName ? maskText(displayName) : null,
    mobileMasked: maskIdentifier(value.mobile, 5, 3),
  };
}

function shipmentCity(value: Prisma.JsonValue): string | null {
  return isRecord(value) && typeof value.city === 'string' ? value.city : null;
}

type TransitionRow = {
  id: string;
  from: FulfillmentStatus | null;
  to: FulfillmentStatus;
  reason: string | null;
  requestId: string | null;
  createdAt: Date;
  actor: { id: string; firstName: string | null; lastName: string | null } | null;
};

/**
 * The timeline is reconstructed from persisted fulfillment transitions, which
 * is the same immutable evidence the dispatch and delivery commands write. The
 * free-text reason is never echoed: only the staff delivery proof reference is
 * projected, so `shipments.read` cannot read arbitrary operator notes.
 */
function shipmentTimeline(rows: TransitionRow[]): AdminShipmentEvent[] {
  return rows.map((row) => {
    const proofReference = staffDeliveryProofReference(row.reason);
    const actorName = [row.actor?.firstName, row.actor?.lastName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ');
    const kind: AdminShipmentEventKind = proofReference
      ? 'DELIVERY_PROOF'
      : row.from === 'READY_TO_SHIP' && row.to === 'SHIPPED'
        ? 'DISPATCH'
        : 'STATE_CHANGE';
    return {
      id: row.id,
      from: row.from,
      to: row.to,
      kind,
      proofReference,
      actor: row.actor
        ? {
            id: row.actor.id,
            displayNameMasked: actorName ? maskText(actorName) : null,
          }
        : null,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

function shipmentSummary(row: ListRow): AdminShipmentSummary {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.number,
    status: row.fulfillment.status,
    carrier: row.carrier,
    trackingCode: row.trackingCode,
    itemCount: row.lines.length,
    totalQuantity: row.lines.reduce((total, line) => total + line.quantity, 0),
    city: shipmentCity(row.addressSnapshot),
    customer: shipmentCustomer(row.order.customer),
    dispatchedAt: row.dispatchedAt.toISOString(),
  };
}

function listMeta(page: number, perPage: number, total: number): OrderListMeta {
  return { page, perPage, total, pages: Math.ceil(total / perPage) };
}

function shipmentWhere(
  query: AdminShipmentListQueryDto,
): Prisma.ShipmentWhereInput {
  const dispatchedFrom = query.dispatchedFrom
    ? new Date(query.dispatchedFrom)
    : undefined;
  const dispatchedTo = query.dispatchedTo
    ? new Date(query.dispatchedTo)
    : undefined;
  if (dispatchedFrom && dispatchedTo && dispatchedFrom > dispatchedTo) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'dispatchedFrom must not be later than dispatchedTo.',
    });
  }
  const carrier = query.carrier?.trim();
  const trackingCode = query.trackingCode?.trim();
  return {
    ...(query.status ? { fulfillment: { is: { status: query.status } } } : {}),
    ...(carrier ? { carrier: { equals: carrier, mode: 'insensitive' } } : {}),
    ...(trackingCode
      ? { trackingCode: { contains: trackingCode, mode: 'insensitive' } }
      : {}),
    ...(dispatchedFrom || dispatchedTo
      ? {
          dispatchedAt: {
            ...(dispatchedFrom ? { gte: dispatchedFrom } : {}),
            ...(dispatchedTo ? { lte: dispatchedTo } : {}),
          },
        }
      : {}),
  };
}

@Injectable()
export class ShipmentReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listShipments(
    query: AdminShipmentListQueryDto,
  ): Promise<AdminShipmentListResponse> {
    const page = query.page;
    const perPage = query.perPage;
    const where = shipmentWhere(query);
    const orderBy: Prisma.ShipmentOrderByWithRelationInput[] = [
      ...(query.sortBy === 'orderNumber'
        ? [{ order: { number: query.sortDir } }]
        : query.sortBy === 'carrier'
          ? [{ carrier: query.sortDir }]
          : [{ dispatchedAt: query.sortDir }]),
      { id: query.sortDir },
    ];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        select: listSelect,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.shipment.count({ where }),
    ]);
    return {
      data: {
        items: rows.map((row) => shipmentSummary(row)),
        meta: listMeta(page, perPage, total),
      },
    };
  }

  async getShipment(id: string): Promise<AdminShipmentDetailResponse> {
    const row = await this.prisma.shipment.findUnique({
      where: { id },
      select: {
        ...listSelect,
        actor: { select: { id: true, firstName: true, lastName: true } },
        fulfillment: {
          select: {
            id: true,
            status: true,
            transitions: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: 50,
              select: {
                id: true,
                from: true,
                to: true,
                reason: true,
                requestId: true,
                createdAt: true,
                actor: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Shipment not found.',
      });
    }
    const actorName = [row.actor?.firstName, row.actor?.lastName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ');
    const detail: AdminShipmentDetail = {
      ...shipmentSummary(row),
      address: shipmentAddress(row.addressSnapshot),
      dispatchedBy: row.actor
        ? {
            id: row.actor.id,
            displayNameMasked: actorName ? maskText(actorName) : null,
          }
        : null,
      lines: row.lines.map((line) => ({
        orderItemId: line.orderItemId,
        sku: line.orderItem.sku,
        productTitle: line.orderItem.productTitle,
        variantTitle: line.orderItem.variantTitle,
        quantity: line.quantity,
      })),
      timeline: shipmentTimeline(row.fulfillment.transitions),
    };
    return { data: { shipment: detail } };
  }
}
