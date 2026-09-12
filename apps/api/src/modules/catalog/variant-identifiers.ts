import { createHash, randomUUID } from 'node:crypto';

export const EMPTY_AXIS_SIGNATURE =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function canonicalizeSku(sku: string): string {
  return sku.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function legacyCombinationSignature(variantId: string): string {
  return `legacy:${variantId}`;
}

export function pendingCombinationSignature(): string {
  return `pending:${randomUUID()}`;
}

export function combinationSignature(
  axisValues: readonly { attributeId: string; optionId: string }[],
): string {
  const pairs = axisValues
    .map((axis) => `${axis.attributeId}:${axis.optionId}`)
    .sort()
    .join('|');
  return createHash('sha256').update(pairs).digest('hex');
}
