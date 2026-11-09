import { Type } from 'class-transformer';
import {
  IsBoolean,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReturnLineDto {
  @IsString() @MinLength(1) @MaxLength(128) orderItemId!: string;
  @IsInt() @Min(1) @Max(1_000_000) quantity!: number;
  @IsIn(['RESTOCK', 'DAMAGED', 'NOT_RETURNED']) disposition!: 'RESTOCK' | 'DAMAGED' | 'NOT_RETURNED';
  @IsOptional() @IsString() @MaxLength(128) warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(128) locationId?: string;
}

export class ReturnCreateDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ReturnLineDto) lines!: ReturnLineDto[];
}

export class ReturnListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
  @IsOptional() @IsString() @MaxLength(64) orderNumber?: string;
}

export class ReturnsSettingsDto {
  @IsInt() @Min(0) @Max(2_147_483_647) expectedVersion!: number;
  @IsBoolean() enabled!: boolean;
}

export class ReturnHolidayCreateDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/u, { message: 'dateKey must be YYYY-MM-DD.' }) dateKey!: string;
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
}
