import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { StocktakeScopeType, StocktakeStatus } from '@prisma/client';
import type { StocktakeActionRequest, StocktakeCountRequest, StocktakeCreateRequest, StocktakeLineInput } from '@iranyaragh/contracts';

const trimOrNull = ({ value }: TransformFnParams) => typeof value === 'string' ? (value.trim() || null) : value;

export class StocktakeListQueryDto {
  @IsOptional() @IsEnum(StocktakeStatus) status?: StocktakeStatus;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class StocktakeLocationQueryDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 50;
}

export class StocktakeVariantQueryDto {
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 50;
}

export class StocktakeHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class StocktakeCreateDto implements StocktakeCreateRequest {
  @IsString() @MinLength(1) @MaxLength(128) warehouseId!: string;
  @IsOptional() @IsEnum(StocktakeScopeType) scopeType?: StocktakeScopeType;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MinLength(1, { each: true }) locationIds?: string[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) @MinLength(1, { each: true }) variantIds?: string[];
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) notes?: string | null;
}

export class StocktakeLineDto implements StocktakeLineInput {
  @IsString() @MinLength(1) @MaxLength(128) locationId!: string;
  @IsString() @MinLength(1) @MaxLength(128) variantId!: string;
  @IsInt() @Min(0) @Max(2_000_000_000) countedQty!: number;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) notes?: string | null;
}

export class StocktakeCountDto implements StocktakeCountRequest {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => StocktakeLineDto) lines!: StocktakeLineDto[];
}

export class StocktakeActionDto implements StocktakeActionRequest {
  @IsInt() @Min(0) expectedVersion!: number;
}
