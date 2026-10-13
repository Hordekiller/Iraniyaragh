import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { CheckoutAddress } from '@iranyaragh/contracts';
export class InvoiceDraftAddressDto implements CheckoutAddress {
  @ApiProperty() @IsString() @MaxLength(32) provinceCode!: string;
  @ApiProperty() @IsString() @MaxLength(100) city!: string;
  @ApiProperty() @IsString() @MaxLength(500) address!: string;
  @ApiProperty() @IsString() @MaxLength(40) postalCode!: string;
  @ApiProperty() @IsString() @MaxLength(120) recipient!: string;
  @ApiProperty() @IsString() @MaxLength(40) mobile!: string;
}
export class InvoiceDraftLineDto {
  @ApiProperty() @IsString() @MaxLength(64) variantId!: string;
  @ApiProperty({ minimum: 1, maximum: 1000 }) @IsInt() @Min(1) @Max(1000) quantity!: number;
  @ApiProperty({ pattern: '^(0|[1-9][0-9]{0,18})$', description: 'Canonical integer IRR.' }) @IsString() @Matches(/^(0|[1-9][0-9]{0,18})$/u) discount!: string;
}
export class InvoiceDraftFieldsDto {
  @ApiProperty({ type: InvoiceDraftAddressDto }) @IsObject() @ValidateNested() @Type(() => InvoiceDraftAddressDto) address!: InvoiceDraftAddressDto;
  @ApiProperty({ type: [InvoiceDraftLineDto], minItems: 1, maxItems: 50 }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => InvoiceDraftLineDto) lines!: InvoiceDraftLineDto[];
  @ApiProperty({ pattern: '^(0|[1-9][0-9]{0,18})$', description: 'Canonical integer IRR.' }) @IsString() @Matches(/^(0|[1-9][0-9]{0,18})$/u) globalDiscount!: string;
  @ApiProperty() @IsString() @MaxLength(64) shippingMethodCode!: string;
  @ApiProperty({ type: String, nullable: true }) @ValidateIf((_object, value) => value !== null) @IsString() @MaxLength(500) note!: string | null;
}
export class InvoiceDraftCreateDto extends InvoiceDraftFieldsDto {
  @ApiProperty() @IsString() @MaxLength(64) customerId!: string;
}
export class InvoiceDraftEditDto extends InvoiceDraftFieldsDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
export class InvoiceDraftVersionDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
export class InvoiceDraftFromOrderDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedOrderVersion!: number;
  @ApiProperty({ type: String, nullable: true }) @ValidateIf((_object, value) => value !== null) @IsString() @MaxLength(500) note!: string | null;
}
export class InvoiceDraftCancelDto extends InvoiceDraftVersionDto {
  @ApiProperty() @IsString() @MaxLength(500) reason!: string;
}
