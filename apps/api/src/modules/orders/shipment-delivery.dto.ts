import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ShipmentDeliveryDto {
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  proofReference!: string;
}
