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
import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '@iranyaragh/contracts';
import {
  FulfillmentStatus as PrismaFulfillmentStatus,
  OrderStatus as PrismaOrderStatus,
  PaymentStatus as PrismaPaymentStatus,
} from '@prisma/client';

export const ORDER_STATUS_VALUES = Object.values(PrismaOrderStatus);
export const PAYMENT_STATUS_VALUES = Object.values(PrismaPaymentStatus);
export const FULFILLMENT_STATUS_VALUES = Object.values(PrismaFulfillmentStatus);

export class CustomerOrderListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
  @IsOptional() @IsIn(ORDER_STATUS_VALUES) status?: OrderStatus;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir: 'asc' | 'desc' = 'desc';
}

export class AdminOrderListQueryDto extends CustomerOrderListQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(PAYMENT_STATUS_VALUES) paymentStatus?: PaymentStatus;
  @IsOptional()
  @IsIn(FULFILLMENT_STATUS_VALUES)
  fulfillmentStatus?: FulfillmentStatus;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'grandTotal'])
  sortBy: 'createdAt' | 'updatedAt' | 'grandTotal' = 'createdAt';
}
