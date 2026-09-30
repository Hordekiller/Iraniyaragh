import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CheckoutAddressDto } from './checkout.dto';

export class StaffOrderLineDto {
  @IsString()
  @MaxLength(64)
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

export class StaffOrderCreateDto {
  /**
   * Optional on the wire so that a guest submission is answered with the
   * explicit `GUEST_ORDER_UNSUPPORTED` domain error rather than an opaque
   * shape-validation failure. Supporting guest orders properly needs an
   * order that can exist without a customer, which this slice does not add.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StaffOrderLineDto)
  lines!: StaffOrderLineDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address!: CheckoutAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
