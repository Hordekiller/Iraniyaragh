import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @IsNotEmpty()
  skuId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number = 1;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
