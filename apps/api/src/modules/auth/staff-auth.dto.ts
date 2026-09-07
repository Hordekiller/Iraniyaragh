import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { STAFF_PASSWORD_MAX_LENGTH, STAFF_PASSWORD_MIN_LENGTH } from './password-hash.service';

const DEV_CODE_PATTERN = /^[A-Za-z0-9._~-]{6,256}$/u;

@ValidatorConstraint({ name: 'passwordPolicyLength', async: false })
export class PasswordPolicyLengthConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    // Count Unicode code points for both bounds (matches PasswordHashService policy).
    const length = Array.from(value).length;
    return length >= STAFF_PASSWORD_MIN_LENGTH && length <= STAFF_PASSWORD_MAX_LENGTH;
  }

  defaultMessage(): string {
    return `password must contain between ${STAFF_PASSWORD_MIN_LENGTH} and ${STAFF_PASSWORD_MAX_LENGTH} characters.`;
  }
}

export class StaffDevSignInDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(DEV_CODE_PATTERN, {
    message: 'code must be a non-empty alphanumeric value no longer than 256 characters.',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  deviceName?: string;
}

export class StaffPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  identifier!: string;

  @IsString()
  @Validate(PasswordPolicyLengthConstraint)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  deviceName?: string;
}

export class StaffPasswordChangeDto {
  @IsString()
  @Validate(PasswordPolicyLengthConstraint)
  currentPassword!: string;

  @IsString()
  @Validate(PasswordPolicyLengthConstraint)
  newPassword!: string;
}

export class StaffTotpVerifyDto {
  @IsString()
  @Matches(/^[0-9]{6}$/u)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  challengeToken!: string;
}

export class StaffRecoveryVerifyDto {
  @IsString()
  @Matches(/^[A-Z0-9-]{8,64}$/u)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  challengeToken!: string;
}

export class StaffTotpConfirmDto {
  @IsString()
  @Matches(/^[0-9]{6}$/u)
  code!: string;
}
