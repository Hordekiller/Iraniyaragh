import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { InventoryMovementType } from '@prisma/client';

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

export class InventoryReservationDto {
  @IsString() warehouseId!: string;
  @IsString() locationId!: string;
  @IsString() variantId!: string;
  @IsOptional() @IsString() orderId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsDateString() expiresAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}

export class InventoryLifecycleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedVersion?: number;
}
