import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { DoorGlassSampleKey } from "@iranyaragh/contracts";
import { DOOR_GLASS_SAMPLE_ENUM, DOOR_GLASS_SAMPLE_KEYS } from "./door-glass-samples";
import { DOOR_STATUSES } from "./door-state";
import type {
  DoorBasis,
  DoorDepositPolicy,
  DoorMaterialConfiguration,
  DoorModelConfiguration,
  DoorStatus,
  DoorType,
} from "@iranyaragh/contracts";

export function normalizeDoorDigits(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const canonical = value
    .trim()
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
  return /^[0-9]+$/.test(canonical) ? Number(canonical) : value;
}
const amountPattern = /^(0|[1-9][0-9]{0,18})$/;
export class DoorAmountLineDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;
  @ApiProperty({ type: String, pattern: amountPattern.source })
  @Matches(amountPattern)
  amount!: string;
}
export class DoorDepositDto implements DoorDepositPolicy {
  @ApiProperty({ type: String, enum: ["PERCENT", "FIXED"] })
  @IsEnum(["PERCENT", "FIXED"])
  kind!: "PERCENT" | "FIXED";
  @ApiProperty({ type: String }) @Matches(amountPattern) value!: string;
  @ApiProperty({ type: String }) @Matches(amountPattern) minimum!: string;
}
export class DoorTechnicalDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  minWidthMm!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maxWidthMm!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  minHeightMm!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maxHeightMm!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  toleranceMm!: number;
}
export class DoorSlotDto {
  @ApiProperty({ type: String })
  @Matches(/^[a-z][a-z0-9_-]{0,47}$/)
  key!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  materialIds!: string[];
  @ApiProperty({ type: Boolean }) @IsBoolean() required!: boolean;
}
export class DoorCompatibilityDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  materialIds!: string[];
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}
export class DoorComponentDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(48) slot!: string;
  @ApiProperty({
    type: String,
    enum: ["AREA", "PERIMETER", "WIDTH", "HEIGHT", "FIXED"],
  })
  @IsEnum(["AREA", "PERIMETER", "WIDTH", "HEIGHT", "FIXED"])
  basis!: DoorBasis;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(1000000)
  multiplier!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(1000000)
  divisor!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  widthDeductionMm!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  heightDeductionMm!: number;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  @Max(100000)
  wasteBps!: number;
  @ApiProperty({ type: String })
  @Matches(/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,6})?$/)
  minimumQuantity!: string;
}
export class DoorLaborDto {
  @ApiProperty({ type: String }) @Matches(amountPattern) fixed!: string;
  @ApiProperty({ type: String })
  @Matches(amountPattern)
  perSquareMeter!: string;
}
export class DoorModelConfigurationDto implements DoorModelConfiguration {
  @ApiProperty({ type: DoorTechnicalDto, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => DoorTechnicalDto)
  technical!: DoorTechnicalDto | null;
  @ApiProperty({ type: Boolean }) @IsBoolean() manualApproval!: boolean;
  @ApiProperty({ type: [DoorSlotDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DoorSlotDto)
  slots!: DoorSlotDto[];
  @ApiProperty({ type: [DoorCompatibilityDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DoorCompatibilityDto)
  incompatible!: DoorCompatibilityDto[];
  @ApiProperty({ type: [DoorComponentDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => DoorComponentDto)
  components!: DoorComponentDto[];
  @ApiProperty({ type: DoorLaborDto, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => DoorLaborDto)
  labor!: DoorLaborDto | null;
  @ApiProperty({ type: [DoorAmountLineDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DoorAmountLineDto)
  additional!: DoorAmountLineDto[];
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10000) taxBps!: number;
  @ApiProperty({ type: String }) @Matches(amountPattern) discount!: string;
  @ApiProperty({ type: String }) @Matches(amountPattern) minimumTotal!: string;
  @ApiProperty({ type: DoorDepositDto, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => DoorDepositDto)
  deposit!: DoorDepositDto | null;
}
export class DoorModelWriteDto {
  @ApiProperty({ type: String })
  @Matches(/^[a-z][a-z0-9-]{0,63}$/)
  code!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;
  @ApiProperty({ type: String, enum: ["FORMLEX", "DECOFIX"] })
  @IsEnum(["FORMLEX", "DECOFIX"])
  type!: DoorType;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(128)
  imageMediaId!: string | null;
  @ApiProperty({ type: DoorModelConfigurationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DoorModelConfigurationDto)
  configuration!: DoorModelConfigurationDto;
}
export class DoorMaterialConfigurationDto implements DoorMaterialConfiguration {
  @ApiPropertyOptional({ type: String, nullable: true, enum: DOOR_GLASS_SAMPLE_KEYS })
  @IsOptional()
  @IsEnum(DOOR_GLASS_SAMPLE_ENUM)
  sampleKey?: DoorGlassSampleKey | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  imageMediaId?: string | null;
  @ApiProperty({ type: String, enum: ["M2", "M", "EACH"] })
  @IsEnum(["M2", "M", "EACH"])
  unit!: "M2" | "M" | "EACH";
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @Matches(amountPattern)
  rate!: string | null;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  validUntil!: string | null;
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(1000)
  specifications!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(100) color!: string;
  @ApiProperty({ type: Number, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(1000)
  thicknessMm!: number | null;
  @ApiProperty({ type: String }) @Matches(amountPattern) processingFee!: string;
  @ApiProperty({ type: String, enum: ["PIECE", "MM", "MM2"], nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsEnum(["PIECE", "MM", "MM2"])
  stockUnit!: "PIECE" | "MM" | "MM2" | null;
}
export class DoorMaterialWriteDto {
  @ApiProperty({ type: String })
  @Matches(/^[a-z][a-z0-9-]{0,63}$/)
  code!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;
  @ApiProperty({
    type: String,
    enum: ["GLASS", "PROFILE", "HARDWARE", "SERVICE"],
  })
  @IsEnum(["GLASS", "PROFILE", "HARDWARE", "SERVICE"])
  category!: "GLASS" | "PROFILE" | "HARDWARE" | "SERVICE";
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(128)
  variantId!: string | null;
  @ApiProperty({ type: DoorMaterialConfigurationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DoorMaterialConfigurationDto)
  configuration!: DoorMaterialConfigurationDto;
}
export class DoorSelectionDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(48) slot!: string;
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(128)
  materialId!: string;
}
export class DoorItemDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(128) modelId!: string;
  @ApiProperty({ type: Number })
  @Transform(({ value }) => normalizeDoorDigits(value))
  @IsInt()
  @Min(1)
  @Max(2147483647)
  widthMm!: number;
  @ApiProperty({ type: Number })
  @Transform(({ value }) => normalizeDoorDigits(value))
  @IsInt()
  @Min(1)
  @Max(2147483647)
  heightMm!: number;
  @ApiProperty({ type: Number })
  @Transform(({ value }) => normalizeDoorDigits(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
  @ApiProperty({ type: [DoorSelectionDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DoorSelectionDto)
  selections!: DoorSelectionDto[];
  @ApiProperty({ type: String }) @IsString() @MaxLength(1000) notes!: string;
}
export class DoorOrderDto {
  @ApiProperty({ type: [DoorItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DoorItemDto)
  items!: DoorItemDto[];
}
export class DoorDraftEditDto extends DoorOrderDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) expectedVersion!: number;
}
export class DoorVersionDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) expectedVersion!: number;
}
export class DoorApprovedLineDto {
  @ApiProperty({ type: String }) @Matches(amountPattern) total!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
export class DoorQuoteApprovalDto extends DoorVersionDto {
  @ApiProperty({ type: [DoorApprovedLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DoorApprovedLineDto)
  lineTotals!: DoorApprovedLineDto[];
  @ApiProperty({ type: String }) @Matches(amountPattern) total!: string;
  @ApiProperty({ type: DoorDepositDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DoorDepositDto)
  depositPolicy!: DoorDepositDto;
  @ApiProperty({ type: [DoorAmountLineDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DoorAmountLineDto)
  adjustments!: DoorAmountLineDto[];
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
export class DoorDeliveryDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  recipient!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  address!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(150) tracking!: string;
}
export class DoorTransitionDto extends DoorVersionDto {
  @ApiProperty({ type: String, enum: DOOR_STATUSES })
  @IsEnum(DOOR_STATUSES)
  status!: DoorStatus;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
  @ApiPropertyOptional({ type: DoorDeliveryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DoorDeliveryDto)
  delivery?: DoorDeliveryDto;
}
export class DoorMessageDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}
export class DoorReserveDto extends DoorVersionDto {
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(128)
  warehouseId!: string;
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(128)
  locationId!: string;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  actualStockQuantity!: number;
  @ApiProperty({ type: String }) @IsDateString() expiresAt!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
export class DoorVisibilityDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() enabled!: boolean;
}
export class DoorPageDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  offset = 0;
  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class DoorStockUnitDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(128) variantId!: string;
  @ApiProperty({ type: String, enum: ["PIECE", "MM", "MM2"] })
  @IsEnum(["PIECE", "MM", "MM2"])
  unit!: "PIECE" | "MM" | "MM2";
}
export class DoorNotificationDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiProperty({ type: Number, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(9999999999)
  templateId!: number | null;
}

export class DoorInvoiceSourceDto extends DoorVersionDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  addressId!: string;
}
