import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CheckoutAddress,
  CheckoutOrderLineSnapshot,
  CheckoutResponse,
} from "@iranyaragh/contracts";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { recordTransition } from "../../common/state-machine";
import { AuditLogService } from "../audit/audit-log.service";
import { withSerializableRetry } from "../../common/serializable-retry";
import { cartInclude } from "./cart-view";
import { normalizeCheckoutAddress } from "./checkout-address";
import {
  SHIPPING_QUOTE_PORT,
  type ShippingQuotePort,
  shippingQuoteContract,
} from "./shipping-quote.port";

const CHECKOUT_SCOPE = "checkout.create:/api/v1/checkout";
const CHECKOUT_RECORD_TTL_MS = 24 * 60 * 60 * 1000;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

class CheckoutContentionError extends Error {}

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(SHIPPING_QUOTE_PORT)
    private readonly shippingQuotes: ShippingQuotePort,
  ) {}

  previewForUser(userId: string, address: CheckoutAddress) {
    return this.shippingQuotes.previewForUser(userId, address);
  }

  async createForUser(
    userId: string,
    input: { address: CheckoutAddress; shippingQuoteId: string },
    idempotencyKey: string,
    requestId: string,
  ): Promise<CheckoutResponse> {
    const address = normalizeCheckoutAddress(input.address);
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
    });
    if (!customer) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Customer profile is not linked to the authenticated user.",
      });
    }

    const keyHash = hash(idempotencyKey);
    const fingerprint = hash(
      JSON.stringify({ address, shippingQuoteId: input.shippingQuoteId }),
    );

    return withSerializableRetry({
      isContention: (error) => error instanceof CheckoutContentionError,
      conflictMessage:
        "Checkout changed concurrently; retry with the same idempotency key.",
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const now = new Date();
            await tx.checkoutIdempotencyRecord.deleteMany({
              where: {
                customerId: customer.id,
                scope: CHECKOUT_SCOPE,
                keyHash,
                expiresAt: { lte: now },
              },
            });

            const prior = await tx.checkoutIdempotencyRecord.findUnique({
              where: {
                customerId_scope_keyHash: {
                  customerId: customer.id,
                  scope: CHECKOUT_SCOPE,
                  keyHash,
                },
              },
            });
            if (prior) {
              if (prior.fingerprint !== fingerprint) {
                throw new ConflictException({
                  code: "IDEMPOTENCY_CONFLICT",
                  message: "Idempotency key payload conflict.",
                });
              }
              if (prior.responseJson) {
                return prior.responseJson as unknown as CheckoutResponse;
              }
              throw new CheckoutContentionError(
                "Checkout claim is incomplete.",
              );
            }

            const claim = await tx.checkoutIdempotencyRecord.create({
              data: {
                customerId: customer.id,
                scope: CHECKOUT_SCOPE,
                keyHash,
                fingerprint,
                expiresAt: new Date(now.getTime() + CHECKOUT_RECORD_TTL_MS),
              },
            });

            const cart = await tx.cart.findUnique({
              where: { customerId: customer.id },
              include: cartInclude(),
            });
            if (!cart || cart.items.length === 0) {
              throw new ConflictException({
                code: "CART_EMPTY",
                message: "Cart is empty.",
              });
            }
            if (
              cart.items.some(
                ({ variant }) =>
                  !variant.isActive ||
                  variant.status !== "ACTIVE" ||
                  variant.product.status !== "ACTIVE",
              )
            ) {
              throw new NotFoundException({
                code: "SKU_NOT_FOUND",
                message: "A cart variant is no longer sellable.",
              });
            }

            const shippingQuote = await this.shippingQuotes.requireValidQuote(
              tx,
              {
                quoteId: input.shippingQuoteId,
                customerId: customer.id,
                cartId: cart.id,
                cartVersion: cart.version,
                address,
                now,
              },
            );

            const orderLines: CheckoutOrderLineSnapshot[] = cart.items.map(
              ({ variant, quantity }) => {
                const amount = variant.salePrice.toString();
                return {
                  variantId: variant.id,
                  productTitle: variant.product.name,
                  variantTitle: variant.title,
                  sku: variant.sku,
                  quantity,
                  unitPrice: { amount, currency: "IRR" },
                  lineTotal: {
                    amount: (variant.salePrice * BigInt(quantity)).toString(),
                    currency: "IRR",
                  },
                };
              },
            );
            const subtotal = orderLines.reduce(
              (total, line) => total + BigInt(line.lineTotal.amount),
              0n,
            );
            if (
              subtotal !== shippingQuote.subtotal ||
              shippingQuote.pricePolicyRevision !== "catalog-sale-price-v1"
            ) {
              throw new ConflictException({
                code: "QUOTE_CHANGED",
                message: "Cart prices changed and must be reviewed.",
              });
            }

            const reservationExpiresAt = new Date(
              now.getTime() + RESERVATION_TTL_MS,
            );
            const order = await tx.order.create({
              data: {
                number: orderNumber(now),
                customerId: customer.id,
                status: "DRAFT",
                subtotal,
                discount: 0n,
                shipping: shippingQuote.amount,
                grandTotal: subtotal + shippingQuote.amount,
                addressSnapshot: address as Prisma.InputJsonObject,
                shippingMethod: shippingQuote.methodCode,
                shippingMethodTitle: shippingQuote.methodTitle,
                shippingPolicyRevision: shippingQuote.policyRevision,
                pricePolicyRevision: shippingQuote.pricePolicyRevision,
                reservationExpiresAt,
                items: {
                  create: orderLines.map((line, ordinal) => ({
                    variantId: line.variantId,
                    sku: line.sku,
                    title: line.variantTitle ?? line.productTitle,
                    productTitle: line.productTitle,
                    variantTitle: line.variantTitle,
                    ordinal,
                    quantity: line.quantity,
                    unitPrice: BigInt(line.unitPrice.amount),
                    total: BigInt(line.lineTotal.amount),
                  })),
                },
              },
            });

            await recordTransition(
              tx,
              "order",
              order.id,
              "DRAFT",
              "PENDING_PAYMENT",
              {
                actorId: userId,
                requestId,
                reason: "CHECKOUT_COMPLETED",
              },
            );

            const reservations = [];
            for (const line of orderLines) {
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
                  { warehouse: { code: "asc" } },
                  { location: { code: "asc" } },
                  { available: "desc" },
                  { id: "asc" },
                ],
              });
              const available = balances.reduce(
                (sum, balance) => sum + balance.available,
                0,
              );
              if (available < line.quantity) {
                throw new ConflictException({
                  code: "INSUFFICIENT_STOCK",
                  message: "Insufficient available stock.",
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
                  throw new CheckoutContentionError(
                    "Inventory balance changed concurrently.",
                  );
                }

                const reservation = await tx.stockReservation.create({
                  data: {
                    warehouseId: balance.warehouseId,
                    locationId: balance.locationId,
                    variantId: line.variantId,
                    orderId: order.id,
                    quantity,
                    expiresAt: reservationExpiresAt,
                    idempotencyKey: reservationIdempotencyKey(
                      customer.id,
                      keyHash,
                      line.variantId,
                      balance.locationId,
                    ),
                  },
                });
                reservations.push(reservation);
                remaining -= quantity;

                await this.auditLog.record(
                  {
                    action: "inventory.reservation.created",
                    entityType: "stock-reservation",
                    entityId: reservation.id,
                    metadata: {
                      orderId: order.id,
                      warehouseId: balance.warehouseId,
                      locationId: balance.locationId,
                      variantId: line.variantId,
                      quantity,
                    },
                    actorId: userId,
                    requestId,
                  },
                  tx,
                );
              }
            }

            const consumed = await tx.shippingQuote.updateMany({
              where: { id: shippingQuote.id, consumedAt: null, orderId: null },
              data: { consumedAt: now, orderId: order.id },
            });
            if (consumed.count !== 1) {
              throw new CheckoutContentionError(
                "Shipping quote was consumed concurrently.",
              );
            }

            await tx.outboxEvent.create({
              data: {
                topic: "ORDER_CREATED",
                aggregateType: "order",
                aggregateId: order.id,
                deduplicationKey: `order-created:${order.id}`,
                payload: {
                  orderId: order.id,
                  customerId: customer.id,
                  reservationExpiresAt: reservationExpiresAt.toISOString(),
                },
              },
            });

            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            await tx.cart.update({
              where: { id: cart.id },
              data: { version: { increment: 1 } },
            });

            const response: CheckoutResponse = {
              data: {
                order: {
                  id: order.id,
                  number: order.number,
                  status: "PENDING_PAYMENT",
                  items: orderLines,
                  subtotal: { amount: subtotal.toString(), currency: "IRR" },
                  discount: { amount: "0", currency: "IRR" },
                  shipping: {
                    amount: shippingQuote.amount.toString(),
                    currency: "IRR",
                  },
                  total: {
                    amount: (subtotal + shippingQuote.amount).toString(),
                    currency: "IRR",
                  },
                  address,
                  shippingQuote: shippingQuoteContract(shippingQuote),
                  pricePolicyRevision: shippingQuote.pricePolicyRevision,
                  reservationExpiresAt: reservationExpiresAt.toISOString(),
                  createdAt: order.createdAt.toISOString(),
                },
                reservations: reservations.map((reservation) => ({
                  id: reservation.id,
                  variantId: reservation.variantId,
                  quantity: reservation.quantity,
                  expiresAt: reservation.expiresAt.toISOString(),
                })),
              },
            };

            await tx.checkoutIdempotencyRecord.update({
              where: { id: claim.id },
              data: {
                orderId: order.id,
                responseJson: response as Prisma.InputJsonObject,
              },
            });
            await this.auditLog.record(
              {
                action: "order.checkout.created",
                entityType: "order",
                entityId: order.id,
                after: {
                  status: "PENDING_PAYMENT",
                  subtotal: subtotal.toString(),
                  shipping: shippingQuote.amount.toString(),
                  grandTotal: (subtotal + shippingQuote.amount).toString(),
                },
                metadata: {
                  itemCount: orderLines.length,
                  reservationCount: reservations.length,
                  shippingMethod: shippingQuote.methodCode,
                },
                actorId: userId,
                requestId,
              },
              tx,
            );

            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function reservationIdempotencyKey(
  customerId: string,
  keyHash: string,
  variantId: string,
  locationId: string,
): string {
  return `checkout:${hash(JSON.stringify([customerId, keyHash, variantId, locationId]))}`;
}

function orderNumber(now: Date): string {
  return `IRY-${now.getTime().toString(36).toUpperCase()}-${randomUUID()
    .replaceAll("-", "")
    .slice(0, 10)
    .toUpperCase()}`;
}
