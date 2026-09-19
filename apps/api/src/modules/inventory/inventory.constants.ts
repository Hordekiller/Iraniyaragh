import { InventoryMovementType } from '@prisma/client';
import type { InventoryChangeType, MaxTransferItems } from '@iranyaragh/contracts';

export const INVENTORY_CHANGE_TYPES = [
  InventoryMovementType.RECEIPT,
  InventoryMovementType.ADJUSTMENT_IN,
  InventoryMovementType.ADJUSTMENT_OUT,
] as const satisfies readonly InventoryChangeType[];

/**
 * Runtime copy of the shared literal contract. The contracts workspace is
 * source-only and must not be loaded by the compiled API process.
 */
export const MAX_TRANSFER_ITEMS: MaxTransferItems = 100;
