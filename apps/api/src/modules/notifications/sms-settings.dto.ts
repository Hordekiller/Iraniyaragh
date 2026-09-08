import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const SENDER_LINE = /^(?:|\d{1,16})$/u;
const IDEMPOTENCY_KEY = /^[\w-]{8,96}$/u;

export class SmsAlertThresholdsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_440)
  failureWindowMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  failureCount!: number;
}

export class SmsSettingsPatchDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  templateId?: number | null;

  @IsOptional()
  @IsString()
  @Matches(SENDER_LINE)
  senderLine?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(10_000)
  timeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  deliveryStatusEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  outageMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenanceMessage?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SmsAlertThresholdsDto)
  alertThresholds?: SmsAlertThresholdsDto | null;
}

export class SmsSettingsUpdateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => SmsSettingsPatchDto)
  patch!: SmsSettingsPatchDto;
}

export class SmsSettingsRotateSecretDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  secret!: string;

  @IsBoolean()
  confirm!: boolean;

  @IsString()
  @Matches(IDEMPOTENCY_KEY)
  idempotencyKey!: string;
}

export class SmsSettingsClearSecretDto {
  @IsBoolean()
  confirm!: boolean;

  @IsString()
  @Matches(IDEMPOTENCY_KEY)
  idempotencyKey!: string;
}

export class SmsSettingsTestSendDto {
  @IsBoolean()
  confirm!: boolean;

  @IsString()
  @Matches(IDEMPOTENCY_KEY)
  idempotencyKey!: string;
}