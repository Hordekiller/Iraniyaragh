import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const AMOUNT = /^\d+$/u;
const CURRENCY = /^[A-Z]{3}$/u;

export class MoneyDto {
  @IsString() @Matches(AMOUNT) amount!: string;
  @IsString() @Matches(CURRENCY) currency!: string;
}

export class CategoryCreateDto {
  @IsString() @MaxLength(150) name!: string;
  @IsString() @Matches(SLUG) @MaxLength(150) slug!: string;
  @IsOptional() @IsString() @MaxLength(128) parentId?: string;
}

export class CategoryUpdateDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @Matches(SLUG) @MaxLength(150) slug?: string;
  @IsOptional() @IsString() @MaxLength(128) parentId?: string | null;
}

export class BrandCreateDto {
  @IsString() @MaxLength(150) name!: string;
  @IsString() @Matches(SLUG) @MaxLength(150) slug!: string;
}

export class BrandUpdateDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @Matches(SLUG) @MaxLength(150) slug?: string;
}

export class ProductVariantDto {
  @IsString() @MaxLength(100) sku!: string;
  @IsOptional() @IsString() @MaxLength(100) barcode?: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @ValidateNested() @Type(() => MoneyDto) costPrice!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) salePrice!: MoneyDto;
  @IsOptional() @IsInt() @Min(0) weightGrams?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ProductCreateDto {
  @IsString() @MaxLength(250) name!: string;
  @IsString() @Matches(SLUG) @MaxLength(250) slug!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsString() @MaxLength(128) brandId?: string;
  @IsOptional() @IsString() @MaxLength(128) categoryId?: string;
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @ValidateNested({ each: true }) @Type(() => ProductVariantDto) variants?: ProductVariantDto[];
}

export class ProductListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) perPage = 25;
  @IsOptional() @IsString() @MaxLength(150) search?: string;
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @IsString() brandId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(['name', 'createdAt', 'updatedAt']) sortBy: 'name' | 'createdAt' | 'updatedAt' = 'createdAt';
  @IsOptional() @IsEnum(['asc', 'desc']) sortDir: 'asc' | 'desc' = 'desc';
}

export class ProductStatusDto {
  @IsEnum(['publish', 'unpublish', 'archive']) action!: 'publish' | 'unpublish' | 'archive';
}
