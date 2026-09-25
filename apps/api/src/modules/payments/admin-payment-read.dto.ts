import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaymentStatus as PrismaPaymentStatus } from '@prisma/client';
import type { PaymentStatus } from '@iranyaragh/contracts';

export const PAYMENT_STATUS_VALUES = Object.values(PrismaPaymentStatus);

export class AdminPaymentListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
  @IsOptional() @IsIn(PAYMENT_STATUS_VALUES) status?: PaymentStatus;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
