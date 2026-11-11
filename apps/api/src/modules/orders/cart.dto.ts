import { Transform } from 'class-transformer';
import { MAX_CART_QUANTITY } from './cart.constants';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CartLineDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  variantId!: string;

  @IsInt() @Min(1) @Max(MAX_CART_QUANTITY) quantity!: number;
}
