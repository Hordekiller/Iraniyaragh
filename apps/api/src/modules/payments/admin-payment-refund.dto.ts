import {
  registerDecorator,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  type ValidationOptions,
} from 'class-validator';

/** Positive integer Rial, no leading zeros, and bounded so it fits in BigInt. */
const POSITIVE_MINOR_UNITS = /^[1-9][0-9]{0,17}$/u;
/** No padded edges on an evidence field. */
const TRIMMED = /^\S(?:[\s\S]*\S)?$/u;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

/** Ordinary spaces are fine; control characters are not. */
function IsFreeOfControlCharacters(validationOptions?: ValidationOptions) {
  return function decorate(object: object, propertyName: string): void {
    registerDecorator({
      name: 'isFreeOfControlCharacters',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || !hasControlCharacter(value),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must not contain control characters.`,
      },
    });
  };
}

/**
 * A refund names no order, customer or amount source: the payment row is the
 * only authority, and the amount is capped server-side by the remaining
 * refundable total.
 */
export class AdminPaymentRefundDto {
  @IsString()
  @Matches(POSITIVE_MINOR_UNITS, {
    message: 'amountMinorUnits must be a positive integer amount in Rial.',
  })
  amountMinorUnits!: string;

  @IsString()
  @MaxLength(128)
  @Matches(TRIMMED, {
    message: 'gatewayReferenceId must not have leading or trailing whitespace.',
  })
  @IsFreeOfControlCharacters()
  gatewayReferenceId!: string;

  @IsString()
  @MaxLength(255)
  @Matches(TRIMMED, { message: 'reason must not have leading or trailing whitespace.' })
  @IsFreeOfControlCharacters()
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsFreeOfControlCharacters()
  note?: string;
}
