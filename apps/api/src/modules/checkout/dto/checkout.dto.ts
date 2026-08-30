import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CheckoutCustomerDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+989[0-9]{9}$/, { message: 'mobile must be a normalized Iranian mobile (+989...) ' })
  mobile!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

export class CheckoutDto {
  @IsNotEmpty()
  customer!: CheckoutCustomerDto;
}
