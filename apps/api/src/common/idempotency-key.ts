import { BadRequestException } from "@nestjs/common";

export function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  const hasControlCharacter = [...(key ?? "")].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!key || key.length > 128 || hasControlCharacter) {
    throw new BadRequestException({
      code: "INVALID_REQUEST",
      message: "A valid Idempotency-Key of at most 128 characters is required.",
    });
  }
  return key;
}
