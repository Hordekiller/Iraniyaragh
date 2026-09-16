import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InventoryMovementType, ReservationStatus, TransferStatus } from '@prisma/client';

export class InventorySnapshotQueryDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;
}

export class InventoryMovementQueryDto extends InventorySnapshotQueryDto {
  @IsOptional() @IsEnum(InventoryMovementType) type?: InventoryMovementType;
}

export class InventoryChangeDto {
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

export class WarehouseCreateDto {
  @IsString() @MaxLength(64) code!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
}

export class WarehouseUpdateDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(400) address?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WarehouseListQueryDto {
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isInactive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;
}

export class LocationListQueryDto extends WarehouseListQueryDto {}

export class LocationCreateDto {
  @IsString() @MaxLength(64) code!: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(64) zone?: string;
  @IsOptional() @IsString() @MaxLength(64) aisle?: string;
  @IsOptional() @IsString() @MaxLength(64) rack?: string;
  @IsOptional() @IsString() @MaxLength(64) shelf?: string;
  @IsOptional() @IsString() @MaxLength(64) bin?: string;
}

export class LocationUpdateDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(64) zone?: string;
  @IsOptional() @IsString() @MaxLength(64) aisle?: string;
  @IsOptional() @IsString() @MaxLength(64) rack?: string;
  @IsOptional() @IsString() @MaxLength(64) shelf?: string;
  @IsOptional() @IsString() @MaxLength(64) bin?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class InventoryReservationDto {
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
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;
}

export class InventoryLifecycleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}

export class TransferItemCreateDto {
  @IsString() variantId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() sourceLocationId?: string;
  @IsOptional() @IsString() targetLocationId?: string;
}

export class TransferCreateDto {
  @IsOptional() @IsString() @MaxLength(64) code?: string;
  @IsString() sourceWarehouseId!: string;
  @IsString() targetWarehouseId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => TransferItemCreateDto)
  items!: TransferItemCreateDto[];
}

export class TransferListQueryDto {
  @IsOptional() @IsEnum(TransferStatus) status?: TransferStatus;
  @IsOptional() @IsString() sourceWarehouseId?: string;
  @IsOptional() @IsString() targetWarehouseId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;
}

export class TransferActionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}
