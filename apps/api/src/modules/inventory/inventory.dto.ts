import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InventoryMovementType, ReservationStatus, TransferStatus } from '@prisma/client';
import {
  type InventoryChangeRequest,
  type InventoryLifecycleRequest,
  type ReservationCreateRequest,
  type TransferActionRequest,
  type TransferCreateRequest,
  type TransferItemCreateRequest,
  type WarehouseCreateRequest,
  type WarehouseLocationCreateRequest,
  type WarehouseLocationUpdateRequest,
  type WarehouseUpdateRequest,
} from '@iranyaragh/contracts';
import { MAX_TRANSFER_ITEMS } from './inventory.constants';

export class InventorySnapshotQueryDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class InventoryMovementQueryDto extends InventorySnapshotQueryDto {
  @IsOptional() @IsEnum(InventoryMovementType) type?: InventoryMovementType;
}

export class InventoryChangeDto implements InventoryChangeRequest {
  @IsString() warehouseId!: string;
  @IsString() locationId!: string;
  @IsString() variantId!: string;
  @IsInt() delta!: number;
  @IsEnum(InventoryMovementType) type!: InventoryMovementType;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(100) referenceType?: string;
  @IsOptional() @IsString() @MaxLength(128) referenceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}

export class WarehouseCreateDto implements WarehouseCreateRequest {
  @IsString() @MaxLength(64) code!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
}

export class WarehouseUpdateDto implements WarehouseUpdateRequest {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WarehouseListQueryDto {
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isInactive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class LocationListQueryDto extends WarehouseListQueryDto {}

export class LocationCreateDto implements WarehouseLocationCreateRequest {
  @IsString() @MaxLength(64) code!: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(64) zone?: string;
  @IsOptional() @IsString() @MaxLength(64) aisle?: string;
  @IsOptional() @IsString() @MaxLength(64) rack?: string;
  @IsOptional() @IsString() @MaxLength(64) shelf?: string;
  @IsOptional() @IsString() @MaxLength(64) bin?: string;
}

export class LocationUpdateDto implements WarehouseLocationUpdateRequest {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(64) zone?: string;
  @IsOptional() @IsString() @MaxLength(64) aisle?: string;
  @IsOptional() @IsString() @MaxLength(64) rack?: string;
  @IsOptional() @IsString() @MaxLength(64) shelf?: string;
  @IsOptional() @IsString() @MaxLength(64) bin?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class InventoryReservationDto implements ReservationCreateRequest {
  @IsString() warehouseId!: string;
  @IsString() locationId!: string;
  @IsString() variantId!: string;
  @IsOptional() @IsString() orderId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsDateString() expiresAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}

export class ReservationListQueryDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsEnum(ReservationStatus) status?: ReservationStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class InventoryLifecycleDto implements InventoryLifecycleRequest {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}

export class TransferItemCreateDto implements TransferItemCreateRequest {
  @IsString() variantId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() sourceLocationId?: string;
  @IsOptional() @IsString() targetLocationId?: string;
}

export class TransferCreateDto implements TransferCreateRequest {
  @IsOptional() @IsString() @MaxLength(64) code?: string;
  @IsString() sourceWarehouseId!: string;
  @IsString() targetWarehouseId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_TRANSFER_ITEMS) @ValidateNested({ each: true })
  @Type(() => TransferItemCreateDto)
  items!: TransferItemCreateDto[];
}

export class TransferListQueryDto {
  @IsOptional() @IsEnum(TransferStatus) status?: TransferStatus;
  @IsOptional() @IsString() sourceWarehouseId?: string;
  @IsOptional() @IsString() targetWarehouseId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class TransferActionDto implements TransferActionRequest {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}
