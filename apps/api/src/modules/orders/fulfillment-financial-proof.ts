import type { Prisma } from '@prisma/client';
/** Called inside the order-locked transaction. Retain settled-payment proof for cash orders. */
export async function hasFulfillmentFinancialProof(tx: Prisma.TransactionClient, orderId: string, status: string, settledPayments: readonly { id: string }[]): Promise<boolean> {
  if (status === 'PAID') return settledPayments.length > 0;
  if (status !== 'CREDIT_APPROVED') return false;
  const document = await tx.receivableDocument.findUnique({ where: { orderId }, select: {
    kind: true, amount: true, issuedAt: true, account: { select: { customerId: true } },
    order: { select: { customerId: true, grandTotal: true, payments: { select: { id: true }, take: 1 } } },
    entries: { where: { kind: 'SALE' }, select: { amount: true, effectiveAt: true } },
  } });
  return !!document && document.kind === 'SALE' && !!document.order && document.account.customerId === document.order.customerId &&
    document.amount === document.order.grandTotal && document.order.payments.length === 0 && document.entries.length === 1 &&
    document.entries[0].amount === document.amount && document.entries[0].effectiveAt.getTime() === document.issuedAt.getTime();
}
