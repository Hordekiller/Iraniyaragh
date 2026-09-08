import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TEMPLATE_ID = /^(?:|[A-Za-z0-9_-]{1,64})$/u;
const SENDER_LINE = /^(?:|\d{1,16})$/u;

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

export class SmsSettingsUpdateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(['development', 'production'])
  environment?: 'development' | 'production';

  @IsOptional()
  @IsString()
  @Matches(TEMPLATE_ID)
  templateId?: string;

  @IsOptional()
  @IsString()
  @Matches(SENDER_LINE)
  senderLine?: string;

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
  maintenanceMessage?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SmsAlertThresholdsDto)
  alertThresholds?: SmsAlertThresholdsDto | null;
}

export class SmsSettingsRotateSecretDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  apiKey!: string;

  @IsBoolean()
  confirm!: boolean;
}

export class SmsSettingsTestSendDto {
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  @IsObject({ message: 'Each template parameter must be a string value.' })
  parameters?: Record<string, string>;
}