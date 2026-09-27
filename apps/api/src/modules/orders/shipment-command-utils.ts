import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function shipmentConflict(message: string): ConflictException {
  return new ConflictException({ code: 'SHIPMENT_STATE_CONFLICT', message });
}

export function shipmentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function storeShipmentCommandReplay(
  tx: Prisma.TransactionClient,
  input: { orderId: string; scope: string; keyHash: string; fingerprint: string; response: unknown },
): Promise<void> {
  await tx.orderCommandIdempotencyRecord.create({ data: {
    orderId: input.orderId,
    scope: input.scope,
    keyHash: input.keyHash,
    fingerprint: input.fingerprint,
    responseJson: input.response as Prisma.InputJsonValue,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  } });
}
