import { BadRequestException } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

export type TransitionMap<Status extends string> = {
  [From in Status]: ReadonlySet<Status>;
};

export const ORDER_TRANSITIONS: TransitionMap<OrderStatus> = {
  DRAFT: new Set<OrderStatus>(['PENDING_PAYMENT', 'CANCELLED']),
  PENDING_PAYMENT: new Set<OrderStatus>(['PAID', 'CANCELLED']),
  PAID: new Set<OrderStatus>([]),
  CANCELLED: new Set<OrderStatus>([]),
  RETURNED: new Set<OrderStatus>([]),
};

export const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  PENDING: new Set<PaymentStatus>(['PAID', 'FAILED', 'CANCELLED']),
  PAID: new Set<PaymentStatus>(['REFUNDED', 'PARTIALLY_REFUNDED']),
  FAILED: new Set<PaymentStatus>(['PENDING', 'CANCELLED']),
  CANCELLED: new Set<PaymentStatus>(['PENDING']),
  REFUNDED: new Set<PaymentStatus>([]),
  PARTIALLY_REFUNDED: new Set<PaymentStatus>(['REFUNDED']),
};

export const FULFILLMENT_TRANSITIONS: TransitionMap<FulfillmentStatus> = {
  PENDING: new Set<FulfillmentStatus>(['PROCESSING', 'CANCELLED']),
  PROCESSING: new Set<FulfillmentStatus>(['READY_TO_SHIP', 'CANCELLED']),
  READY_TO_SHIP: new Set<FulfillmentStatus>(['SHIPPED']),
  SHIPPED: new Set<FulfillmentStatus>(['DELIVERED']),
  DELIVERED: new Set<FulfillmentStatus>(['RETURNED']),
  CANCELLED: new Set<FulfillmentStatus>([]),
  RETURNED: new Set<FulfillmentStatus>([]),
};

const MACHINES = {
  order: ORDER_TRANSITIONS,
  payment: PAYMENT_TRANSITIONS,
  fulfillment: FULFILLMENT_TRANSITIONS,
} as const;

export type MachineName = keyof typeof MACHINES;

export function canTransition<Status extends string>(
  from: Status,
  to: Status,
  map: TransitionMap<Status>,
): boolean {
  if (from === to) return false;
  return (map[from] as ReadonlySet<Status> | undefined)?.has(to) ?? false;
}

export const ORDER_STATE_CONFLICT_ERROR = 'ORDER_STATE_CONFLICT';

export function assertTransition<Status extends string>(
  from: Status,
  to: Status,
  map: TransitionMap<Status>,
  message = `Illegal state transition: ${String(from)} -> ${String(to)}.`,
): void {
  if (!canTransition(from, to, map)) {
    const error = new BadRequestException({
      code: ORDER_STATE_CONFLICT_ERROR,
      message,
    });
    error.message = message;
    throw error;
  }
}

export function transitionMachine(name: MachineName) {
  return MACHINES[name];
}

type TransitionTarget = {
  machine: MachineName;
  parentIdName: 'orderId' | 'paymentId' | 'fulfillmentId';
  delegate: 'orderTransition' | 'paymentTransition' | 'fulfillmentTransition';
  statusModel: 'order' | 'payment' | 'fulfillment';
};

const TARGETS: Record<MachineName, TransitionTarget> = {
  order: {
    machine: 'order',
    parentIdName: 'orderId',
    delegate: 'orderTransition',
    statusModel: 'order',
  },
  payment: {
    machine: 'payment',
    parentIdName: 'paymentId',
    delegate: 'paymentTransition',
    statusModel: 'payment',
  },
  fulfillment: {
    machine: 'fulfillment',
    parentIdName: 'fulfillmentId',
    delegate: 'fulfillmentTransition',
    statusModel: 'fulfillment',
  },
};

/**
 * Appends an immutable transition row and advances the aggregate's current status
 * in the same transaction. The transition tables are the authoritative history;
 * the single-column status field is the denormalized current state.
 */
export async function recordTransition<Status extends string>(
  tx: Prisma.TransactionClient,
  machine: MachineName,
  parentId: string,
  currentStatus: Status,
  nextStatus: Status,
  {
    actorId,
    requestId,
    reason,
  }: { actorId?: string | null; requestId?: string | null; reason?: string | null } = {},
): Promise<{ id: string; from: Status; to: Status }> {
  assertTransition(currentStatus, nextStatus, MACHINES[machine] as TransitionMap<Status>);

  const target = TARGETS[machine];
  const row = await (tx[target.delegate] as never as {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  }).create({
    data: {
      [target.parentIdName]: parentId,
      from: currentStatus,
      to: nextStatus,
      actorId: actorId ?? null,
      requestId: requestId ?? null,
      reason: reason ?? null,
    },
  });

  await (tx[target.statusModel] as never as {
    update: (args: { where: { id: string }; data: { status: never } }) => Promise<unknown>;
  }).update({
    where: { id: parentId },
    data: { status: nextStatus as never },
  });

  return { id: row.id, from: currentStatus, to: nextStatus };
}