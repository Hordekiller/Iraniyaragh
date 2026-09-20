import { BadRequestException } from '@nestjs/common';

export function cartIdempotencyHeader() {
  return {
    name: 'Idempotency-Key',
    required: true,
    description: 'Opaque operation-scoped retry key, maximum 128 characters.',
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  } as const;
}

export function normalizeCartIdempotencyKey(
  value: string | undefined,
): string {
  const key = value?.trim();
  if (!key || key.length > 128 || hasControlCharacter(key)) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key of at most 128 characters is required.',
    });
  }
  return key;
}

export function normalizeCartVariantId(value: string): string {
  const variantId = value.trim();
  if (
    !variantId ||
    variantId.length > 191 ||
    hasControlCharacter(variantId)
  ) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid variantId is required.',
    });
  }
  return variantId;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}
