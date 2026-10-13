import { IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { InvoiceTaxTreatment } from '@iranyaragh/contracts';
export class InvoicePolicyDto {
  @IsString() @MinLength(1) @MaxLength(200) sellerName!: string;
  @IsString() @MinLength(1) @MaxLength(1000) sellerAddress!: string;
  @IsString() @MinLength(1) @MaxLength(200) sellerContact!: string;
  @IsIn(['EXCLUSIVE', 'INCLUSIVE', 'EXEMPT']) taxTreatment!: InvoiceTaxTreatment;
  @IsInt() @Min(0) @Max(10000) taxRateBps!: number;
  @ValidateIf((_object, value) => value !== null) @IsString() @MinLength(1) @MaxLength(500) exemptionReason!: string | null;
  @IsInt() @Min(0) @Max(10000) discountCapBps!: number;
  @IsBoolean() shippingTaxable!: boolean;
  @IsBoolean() isActive!: boolean;
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number | null;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
