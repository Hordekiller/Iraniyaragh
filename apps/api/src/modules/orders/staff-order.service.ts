import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AdminOrderSummary,
  CheckoutAddress,
  StaffOrderCreateInput,
  StaffOrderCreateResponse,
  StaffOrderLineInput,
  StaffOrderOption,
  StaffOrderOptionsResponse,
} from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { recordTransition } from '../../common/state-machine';
import { withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';
import { maskIdentifier, maskText } from '../../common/masking';
import { normalizeCheckoutAddress } from './checkout-address';
import { adminListSelect, adminOrderSummary } from './order-read.service';

const STAFF_ORDER_SCOPE = 'order.staff.create:/api/v1/orders/admin';
const RESERVATION_TTL_MS = 15 * 60 * 1000;
const MAX_LINES = 50;
const OPTIONS_LIMIT = 20;
const MAX_LINE_QUANTITY = 1000;
const PRICE_POLICY_REVISION = 'catalog-sale-price-v1';
const SHIPPING_POLICY_REVISION = 'staff-pickup-v1';

class StaffOrderContentionError extends Error {}

type ResolvedLine = {
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: bigint;
  lineTotal: bigint;
};

@Injectable()
export class StaffOrderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Create a staff-entered order (counter, phone, trade) for an existing
   * customer. Pricing, inventory reservation, the order state machine and the
   * audit trail all reuse the same machinery as customer checkout; the only
   * difference is that lines are supplied by staff instead of read from a cart.
   */
  async create(input: {
    actorId: string;
    requestId: string;
    idempotencyKey: string;
    payload: StaffOrderCreateInput;
  }): Promise<StaffOrderCreateResponse> {
    const { actorId, requestId, idempotencyKey } = input;
    const payload = this.validate(input.payload);
    const keyHash = hash(idempotencyKey);
    const fingerprint = hash(
      JSON.stringify({
        customerId: payload.customerId,
        address: payload.address,
        lines: payload.lines,
        note: payload.note ?? null,
      }),
    );

    return withSerializableRetry({
      isContention: (error) => error instanceof StaffOrderContentionError,
      conflictMessage:
        'Staff order changed concurrently; retry with the same idempotency key.',
      operation: async () => {
        const response = await this.prisma.$transaction(
          async (tx) => {
            const now = new Date();

            const prior = await tx.staffOrderCommandRecord.findUnique({
              where: {
                actorId_scope_keyHash: {
                  actorId,
                  scope: STAFF_ORDER_SCOPE,
                  keyHash,
                },
              },
            });
            if (prior) {
              if (prior.payloadHash !== fingerprint) {
                throw new ConflictException({
                  code: 'IDEMPOTENCY_CONFLICT',
                  message: 'Idempotency key payload conflict.',
                });
              }
              if (prior.response && prior.orderId) {
                // The stored body is the original creation response, so the
                // replay flag has to be re-applied here. Returning the stored
                // JSON verbatim would claim `replayed: false` on a replay and
                // tell the operator to create the order a second time.
                const stored = prior.response as unknown as {
                  data: StaffOrderCreateResponse['data'];
                };
                return {
                  response: { data: { ...stored.data, replayed: true } },
                  replayed: true,
                };
              }
              throw new StaffOrderContentionError(
                'Staff order claim is incomplete.',
              );
            }

            const customer = await tx.customer.findUnique({
              where: { id: payload.customerId },
            });
            if (!customer) {
              throw new NotFoundException({
                code: 'CUSTOMER_NOT_FOUND',
                message: 'Customer does not exist.',
              });
            }
            if (customer.status !== 'ACTIVE') {
              throw new ConflictException({
                code: 'CUSTOMER_INACTIVE',
                message: 'Customer is inactive and cannot receive new orders.',
              });
            }

            const lines = await this.priceLines(tx, payload.lines);
            const subtotal = lines.reduce(
              (total, line) => total + line.lineTotal,
              0n,
            );

            // Staff orders never accept a client-supplied amount. The grand
            // total is exactly the sum of the server-priced lines; a discount
            // has to be introduced by a server-side pricing rule, not by a
            // number typed into the admin form.
            const discount = 0n;
            const grandTotal = subtotal;

            // Counter and phone orders are handed over at the counter, so
            // shipping is free and recorded against an explicit pickup policy
            // revision rather than a configured courier quote.
            const shipping = 0n;
            const reservationExpiresAt = new Date(
              now.getTime() + RESERVATION_TTL_MS,
            );

            const order = await tx.order.create({
              data: {
                number: orderNumber(now),
                customerId: customer.id,
                status: 'DRAFT',
                subtotal,
                discount,
                shipping,
                grandTotal,
                addressSnapshot: payload.address as unknown as Prisma.InputJsonObject,
                staffNote: payload.note ?? null,
                shippingMethod: 'PICKUP',
                shippingMethodTitle: 'تحویل حضوری',
                shippingPolicyRevision: SHIPPING_POLICY_REVISION,
                pricePolicyRevision: PRICE_POLICY_REVISION,
                reservationExpiresAt,
                items: {
                  create: lines.map((line, ordinal) => ({
                    variantId: line.variantId,
                    sku: line.sku,
                    title: line.variantTitle ?? line.productTitle,
                    productTitle: line.productTitle,
                    variantTitle: line.variantTitle,
                    ordinal,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    total: line.lineTotal,
                  })),
                },
              },
            });

            await recordTransition(tx, 'order', order.id, 'DRAFT', 'PENDING_PAYMENT', {
              actorId,
              requestId,
              reason: 'STAFF_ORDER_CREATED',
            });

            const reservations = await this.reserveLines(tx, {
              order,
              lines,
              customerId: customer.id,
              keyHash,
              reservationExpiresAt,
              actorId,
              requestId,
            });

            await tx.outboxEvent.create({
              data: {
                topic: 'ORDER_CREATED',
                aggregateType: 'order',
                aggregateId: order.id,
                deduplicationKey: `order-created:${order.id}`,
                payload: {
                  orderId: order.id,
                  customerId: customer.id,
                  source: 'STAFF',
                  reservationExpiresAt: reservationExpiresAt.toISOString(),
                },
              },
            });

            const row = await tx.order.findUniqueOrThrow({
              where: { id: order.id },
              select: adminListSelect,
            });
            const summary = adminOrderSummary(row);
            const result: StaffOrderCreateResponse = {
              data: {
                order: summary,
                replayed: false,
                reservations: reservations.map((reservation) => ({
                  id: reservation.id,
                  variantId: reservation.variantId,
                  quantity: reservation.quantity,
                  expiresAt: reservation.expiresAt.toISOString(),
                })),
              },
            };

            try {
              await tx.staffOrderCommandRecord.create({
                data: {
                  actorId,
                  scope: STAFF_ORDER_SCOPE,
                  keyHash,
                  payloadHash: fingerprint,
                  orderId: order.id,
                  response: result as unknown as Prisma.InputJsonObject,
                },
              });
            } catch (error) {
              // Two concurrent submissions of the same key both read "no prior
              // record" and both build an order. The unique index is the real
              // arbiter: the loser rolls back and retries, finds the winner's
              // record and replays it instead of creating a second order.
              if (isIdempotencyRace(error)) {
                throw new StaffOrderContentionError(
                  'Another staff order claimed this idempotency key.',
                );
              }
              throw error;
            }

            await this.auditLog.record(
              {
                action: 'order.staff.created',
                entityType: 'order',
                entityId: order.id,
                after: {
                  status: 'PENDING_PAYMENT',
                  subtotal: subtotal.toString(),
                  discount: discount.toString(),
                  grandTotal: grandTotal.toString(),
                },
                metadata: {
                  itemCount: lines.length,
                  reservationCount: reservations.length,
                  totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
                },
                actorId,
                requestId,
              },
              tx,
            );

            return { response: result, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return response.response;
      },
    });
  }

  /**
   * Typeahead source for the staff order form.
   *
   * This is deliberately its own endpoint instead of a reuse of the customer
   * or purchasing lookups: those require the customer-record and purchasing
   * permissions, and an order-taker who only holds order permissions still has
   * to be able to find the customer and the SKU. Nothing here widens what such
   * a caller may see — a customer's mobile stays masked, exactly as in the
   * order list, and no catalog pricing is disclosed because the server prices
   * the order anyway.
   */
  async options(query: {
    kind: 'customer' | 'variant';
    search?: string;
    offset?: number;
    limit?: number;
  }): Promise<StaffOrderOptionsResponse> {
    const limit = Math.min(query.limit ?? OPTIONS_LIMIT, OPTIONS_LIMIT);
    const offset = query.offset ?? 0;
    const needle = query.search?.trim() ?? '';

    if (query.kind === 'customer') {
      const digits = needle.replace(/[\s\-()_]/g, '').replace(/^\+/, '');
      const where =
        needle === ''
          ? { status: 'ACTIVE' as const }
          : {
              status: 'ACTIVE' as const,
              OR: [
                { firstName: { contains: needle, mode: 'insensitive' as const } },
                { lastName: { contains: needle, mode: 'insensitive' as const } },
                ...(digits.length >= 3
                  ? [
                      {
                        mobile: {
                          contains: digits,
                          mode: 'insensitive' as const,
                        },
                      },
                    ]
                  : []),
              ],
            };

      const customers = await this.prisma.customer.findMany({
        where,
        select: { id: true, firstName: true, lastName: true, mobile: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      });

      return {
        data: {
          items: customers.map<StaffOrderOption>((customer) => ({
            id: customer.id,
            label: displayName(customer.firstName, customer.lastName),
            detail: maskIdentifier(customer.mobile, 5, 3),
          })),
          count: customers.length,
        },
      };
    }

    const textMatch = { contains: needle, mode: 'insensitive' as const };
    const variantWhere: Prisma.ProductVariantWhereInput = {
      isActive: true,
      status: 'ACTIVE',
      product: { status: 'ACTIVE' },
      ...(needle === ''
        ? {}
        : {
            OR: [{ sku: textMatch }, { product: { name: textMatch } }],
          }),
    };

    const variants = await this.prisma.productVariant.findMany({
      where: variantWhere,
      select: {
        id: true,
        sku: true,
        title: true,
        product: { select: { name: true } },
      },
      orderBy: [{ sku: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    });

    return {
      data: {
        items: variants.map<StaffOrderOption>((variant) => ({
          id: variant.id,
          label: [variant.sku, variant.product.name, variant.title]
            .filter((part): part is string => Boolean(part?.trim()))
            .join(' — '),
          detail: null,
        })),
        count: variants.length,
      },
    };
  }

  private validate(input: StaffOrderCreateInput): {
    customerId: string;
    lines: StaffOrderLineInput[];
    address: CheckoutAddress;
    note?: string;
  } {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'A request body is required.',
      });
    }
    // Guest orders are a documented deferral, not an accident: answering with
    // a dedicated code tells the operator exactly why the submission failed
    // instead of blaming the payload shape.
    if (input.customerId === undefined || input.customerId === null) {
      throw new UnprocessableEntityException({
        code: 'GUEST_ORDER_UNSUPPORTED',
        message:
          'Staff orders must reference an existing customer. Guest orders are not supported yet.',
      });
    }
    if (typeof input.customerId !== 'string' || !input.customerId.trim()) {
      throw new UnprocessableEntityException({
        code: 'GUEST_ORDER_UNSUPPORTED',
        message:
          'Staff orders must reference an existing customer. Guest orders are not supported yet.',
      });
    }
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'At least one order line is required.',
      });
    }
    if (input.lines.length > MAX_LINES) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: `An order may contain at most ${MAX_LINES} lines.`,
      });
    }

    const seen = new Set<string>();
    const lines = input.lines.map((line) => {
      if (
        !line ||
        typeof line.variantId !== 'string' ||
        !line.variantId.trim()
      ) {
        throw new BadRequestException({
          code: 'INVALID_REQUEST',
          message: 'Every line requires a variantId.',
        });
      }
      if (seen.has(line.variantId)) {
        throw new BadRequestException({
          code: 'DUPLICATE_LINE',
          message: `variantId ${line.variantId} appears more than once.`,
        });
      }
      seen.add(line.variantId);
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > MAX_LINE_QUANTITY
      ) {
        throw new BadRequestException({
          code: 'INVALID_REQUEST',
          message: `Quantity for ${line.variantId} must be an integer between 1 and ${MAX_LINE_QUANTITY}.`,
        });
      }
      return { variantId: line.variantId, quantity: line.quantity };
    });

    const note =
      typeof input.note === 'string' && input.note.trim()
        ? input.note.trim().slice(0, 500)
        : undefined;

    return {
      customerId: input.customerId.trim(),
      lines,
      address: normalizeCheckoutAddress(input.address),
      note,
    };
  }

  private async priceLines(
    tx: Prisma.TransactionClient,
    requested: StaffOrderLineInput[],
  ): Promise<ResolvedLine[]> {
    const variants = await tx.productVariant.findMany({
      where: { id: { in: requested.map((line) => line.variantId) } },
      include: { product: true },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));

    return requested.map((line) => {
      const variant = byId.get(line.variantId);
      if (!variant) {
        throw new NotFoundException({
          code: 'SKU_NOT_FOUND',
          message: `Variant ${line.variantId} does not exist.`,
        });
      }
      if (
        !variant.isActive ||
        variant.status !== 'ACTIVE' ||
        variant.product.status !== 'ACTIVE'
      ) {
        throw new ConflictException({
          code: 'SKU_NOT_SELLABLE',
          message: `Variant ${line.variantId} is no longer sellable.`,
        });
      }
      const unitPrice = variant.salePrice;
      if (unitPrice < 0n) {
        throw new UnprocessableEntityException({
          code: 'PRICE_UNAVAILABLE',
          message: `Variant ${line.variantId} has no valid sale price.`,
        });
      }
      return {
        variantId: variant.id,
        sku: variant.sku,
        productTitle: variant.product.name,
        variantTitle: variant.title,
        quantity: line.quantity,
        unitPrice,
        lineTotal: unitPrice * BigInt(line.quantity),
      };
    });
  }

  private async reserveLines(
    tx: Prisma.TransactionClient,
    context: {
      order: { id: string };
      lines: ResolvedLine[];
      customerId: string;
      keyHash: string;
      reservationExpiresAt: Date;
      actorId: string;
      requestId: string;
    },
  ) {
    const reservations: {
      id: string;
      variantId: string;
      quantity: number;
      expiresAt: Date;
    }[] = [];

    for (const line of context.lines) {
      const balances = await tx.inventoryBalance.findMany({
        where: {
          variantId: line.variantId,
          available: { gt: 0 },
          warehouse: { isActive: true },
          location: { isActive: true },
        },
        select: {
          id: true,
          warehouseId: true,
          locationId: true,
          available: true,
          version: true,
        },
        orderBy: [
          { warehouse: { code: 'asc' } },
          { location: { code: 'asc' } },
          { available: 'desc' },
          { id: 'asc' },
        ],
      });
      const available = balances.reduce(
        (sum, balance) => sum + balance.available,
        0,
      );
      if (available < line.quantity) {
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message: `Insufficient available stock for ${line.sku}.`,
        });
      }

      let remaining = line.quantity;
      for (const balance of balances) {
        if (remaining === 0) break;
        const quantity = Math.min(remaining, balance.available);
        const changed = await tx.inventoryBalance.updateMany({
          where: {
            id: balance.id,
            version: balance.version,
            available: { gte: quantity },
            warehouse: { isActive: true },
            location: { isActive: true },
          },
          data: {
            reserved: { increment: quantity },
            available: { decrement: quantity },
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new StaffOrderContentionError(
            'Inventory balance changed concurrently.',
          );
        }

        const reservation = await tx.stockReservation.create({
          data: {
            warehouseId: balance.warehouseId,
            locationId: balance.locationId,
            variantId: line.variantId,
            orderId: context.order.id,
            quantity,
            expiresAt: context.reservationExpiresAt,
            idempotencyKey: `staff-order:${hash(
              JSON.stringify([
                context.keyHash,
                line.variantId,
                balance.locationId,
              ]),
            )}`,
          },
        });
        reservations.push({
          id: reservation.id,
          variantId: reservation.variantId,
          quantity: reservation.quantity,
          expiresAt: reservation.expiresAt,
        });
        remaining -= quantity;

        await this.auditLog.record(
          {
            action: 'inventory.reservation.created',
            entityType: 'stock-reservation',
            entityId: reservation.id,
            metadata: {
              orderId: context.order.id,
              warehouseId: balance.warehouseId,
              locationId: balance.locationId,
              variantId: line.variantId,
              quantity,
              source: 'STAFF_ORDER',
            },
            actorId: context.actorId,
            requestId: context.requestId,
          },
          tx,
        );
      }
    }

    return reservations;
  }
}

function displayName(firstName: string | null, lastName: string | null): string {
  const name = [firstName, lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return name ? maskText(name) : 'بدون نام';
}

function isIdempotencyRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    (error.meta?.target as unknown[] | undefined)?.includes(
      'StaffOrderCommandRecord_actorId_scope_keyHash_key',
    ) === true
  );
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function orderNumber(now: Date): string {
  return `IRY-${now.getTime().toString(36).toUpperCase()}-${randomUUID()
    .replaceAll('-', '')
    .slice(0, 10)
    .toUpperCase()}`;
}

export type { AdminOrderSummary };
