import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutAddressDto {
  @IsString() @IsNotEmpty() @MaxLength(32) provinceCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) city!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) address!: string;
  @IsString() @IsNotEmpty() @MaxLength(32) postalCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) recipient!: string;
  @IsString() @IsNotEmpty() @MaxLength(32) mobile!: string;
}

export class CheckoutPreviewDto {
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address!: CheckoutAddressDto;
}

export class CheckoutCreateDto extends CheckoutPreviewDto {
  @IsString() @IsNotEmpty() @MaxLength(128) shippingQuoteId!: string;
}
