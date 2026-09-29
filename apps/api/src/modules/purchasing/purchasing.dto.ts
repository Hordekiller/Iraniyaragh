import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';
import type { PurchaseOrderActionRequest, PurchaseOrderCreateRequest, PurchaseOrderItemInput, PurchaseOrderUpdateRequest } from '@iranyaragh/contracts';

const trimOrNull = ({ value }: TransformFnParams) => typeof value === 'string' ? (value.trim() || null) : value;

export class PurchaseOrderListQueryDto {
  @IsOptional() @IsEnum(PurchaseOrderStatus) status?: PurchaseOrderStatus;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class PurchaseOrderHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class PurchaseOrderOptionsQueryDto {
  @IsIn(['supplier', 'warehouse', 'variant']) kind!: 'supplier' | 'warehouse' | 'variant';
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 25;
}

export class PurchaseOrderItemDto implements PurchaseOrderItemInput {
  @IsString() @MinLength(1) @MaxLength(128) variantId!: string;
  @IsInt() @Min(1) @Max(1_000_000) orderedQty!: number;
  @IsString() @Matches(/^[1-9][0-9]{0,18}$/u) unitCost!: string;
}

export class PurchaseOrderCreateDto implements PurchaseOrderCreateRequest {
  @IsString() @MinLength(1) @MaxLength(128) supplierId!: string;
  @IsString() @MinLength(1) @MaxLength(128) warehouseId!: string;
  @IsOptional() @IsDateString() expectedAt?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(1000) notes?: string | null;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PurchaseOrderItemDto) items!: PurchaseOrderItemDto[];
}

export class PurchaseOrderUpdateDto implements PurchaseOrderUpdateRequest {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsDateString() expectedAt?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(1000) notes?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PurchaseOrderItemDto) items?: PurchaseOrderItemDto[];
}

export class PurchaseOrderActionDto implements PurchaseOrderActionRequest {
  @IsInt() @Min(0) expectedVersion!: number;
}
