import { ConflictException } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { recordTransition } from "../../common/state-machine";
import type { AuditLogService } from "../audit/audit-log.service";
import { doorPaid } from "./door-pricing";

/** Called exclusively by the existing verifier after provider verification,
 * inside its existing serializable transaction and order advisory lock. */
export async function settleDoorPaymentIn(
  tx: Prisma.TransactionClient,
  payment: Pick<Payment, "id" | "orderId" | "amount">,
  referenceId: string,
  requestId: string,
  audit: AuditLogService,
) {
  const row = await tx.doorOrder.findUniqueOrThrow({
    where: { id: payment.orderId },
    include: { order: { include: { payments: true } }, quotes: true },
  });
  const allocation = await tx.doorPaymentAllocation.findUnique({
    where: { paymentId: payment.id },
    include: { quote: true },
  });
  if (
    !allocation ||
    allocation.quote.orderId !== row.id ||
    !allocation.quote.approved
  )
    throw new ConflictException(
      "The payment has no valid approved quotation allocation.",
    );
  const quote = row.quotes.find((q) => q.version === row.currentQuoteVersion);
  if (!quote?.approved || quote.total === null)
    throw new ConflictException("A final quotation is missing.");
  await recordTransition(tx, "payment", payment.id, "PENDING", "PAID", {
    requestId,
    reason: "GATEWAY_VERIFIED",
  });
  await tx.payment.update({ where: { id: payment.id }, data: { referenceId } });
  const paid = doorPaid(
    row.order.payments.map((p) =>
      p.id === payment.id ? { ...p, status: "PAID" } : p,
    ),
  );
  const cancelled =
    row.status === "CANCELLED" || row.order.status === "CANCELLED";
  const needsReview =
    cancelled || paid > quote.total || allocation.quoteId !== quote.id;
  let orderStatus = row.order.status;
  if (
    !needsReview &&
    paid >= quote.total &&
    orderStatus === "PENDING_PAYMENT"
  ) {
    await recordTransition(tx, "order", row.id, "PENDING_PAYMENT", "PAID", {
      requestId,
      reason: "DOOR_SETTLED",
    });
    orderStatus = "PAID";
  }
  if (
    !needsReview &&
    paid >= quote.total &&
    row.status === "AWAITING_DEPOSIT" &&
    row.customerAcceptedQuoteVersion === quote.version
  ) {
    await tx.doorOrder.update({
      where: { id: row.id },
      data: { status: "DEPOSIT_PAID", version: { increment: 1 } },
    });
  }
  await tx.doorProductionRecord.create({
    data: {
      orderId: row.id,
      action: "PAYMENT_VERIFIED",
      message: needsReview
        ? "پرداخت تأیید شد و نیازمند تطبیق مالی است."
        : "دریافت پرداخت توسط درگاه تأیید شد.",
      payload: {
        paymentId: payment.id,
        quoteId: allocation.quoteId,
        amount: payment.amount.toString(),
      },
    },
  });
  // Reuse the current reconciliation/refund-review worker, never infer stock
  // consumption or production readiness from a monetary callback.
  await tx.outboxEvent.create({
    data: {
      topic: needsReview
        ? "PAYMENT_VERIFIED_AFTER_CANCELLED"
        : "DOOR_PAYMENT_VERIFIED",
      aggregateType: "payment",
      aggregateId: payment.id,
      deduplicationKey: `payment-verified:${payment.id}`,
      payload: {
        paymentId: payment.id,
        orderId: row.id,
        amount: payment.amount.toString(),
        currency: "IRR",
        quoteId: allocation.quoteId,
      },
    },
  });
  await audit.record(
    {
      requestId,
      action: "custom-door.payment.verified",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        orderId: row.id,
        quoteId: allocation.quoteId,
        amount: payment.amount.toString(),
        needsReview,
      },
    },
    tx,
  );
  return { cancelled, orderStatus };
}
