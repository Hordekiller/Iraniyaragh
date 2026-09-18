import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
} from "@iranyaragh/contracts";

export class CustomerOrderListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
  @IsOptional() @IsIn(ORDER_STATUSES) status?: OrderStatus;
  @IsOptional() @IsIn(["asc", "desc"]) sortDir: "asc" | "desc" = "desc";
}

export class AdminOrderListQueryDto extends CustomerOrderListQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(PAYMENT_STATUSES) paymentStatus?: PaymentStatus;
  @IsOptional()
  @IsIn(FULFILLMENT_STATUSES)
  fulfillmentStatus?: FulfillmentStatus;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "grandTotal"])
  sortBy: "createdAt" | "updatedAt" | "grandTotal" = "createdAt";
}
