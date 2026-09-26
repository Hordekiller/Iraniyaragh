import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ShipmentDispatchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/)
  carrier!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9-]*$/)
  trackingCode!: string;
}
