import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FulfillmentStatus } from '@iranyaragh/contracts';
import { FulfillmentStatus as PrismaFulfillmentStatus } from '@prisma/client';

export const FULFILLMENT_STATUS_VALUES = Object.values(
  PrismaFulfillmentStatus,
);

/**
 * A shipment read is always scoped to a real, dispatched shipment, so the
 * status filter only accepts the post-dispatch states a shipment can hold.
 */
export const SHIPMENT_STATUS_VALUES = FULFILLMENT_STATUS_VALUES.filter(
  (value): value is FulfillmentStatus =>
    value === 'SHIPPED' || value === 'DELIVERED' || value === 'RETURNED',
);

export class AdminShipmentListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
  @IsOptional() @IsIn(SHIPMENT_STATUS_VALUES) status?: FulfillmentStatus;
  @IsOptional() @IsString() @MaxLength(80) carrier?: string;
  @IsOptional() @IsString() @MaxLength(120) trackingCode?: string;
  @IsOptional() @IsDateString() dispatchedFrom?: string;
  @IsOptional() @IsDateString() dispatchedTo?: string;
  @IsOptional()
  @IsIn(['dispatchedAt', 'orderNumber', 'carrier'])
  sortBy: 'dispatchedAt' | 'orderNumber' | 'carrier' = 'dispatchedAt';
  @IsOptional() @IsIn(['asc', 'desc']) sortDir: 'asc' | 'desc' = 'desc';
}
