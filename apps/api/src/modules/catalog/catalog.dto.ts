import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotIn, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const AMOUNT = /^\d{1,15}$/u;
const ATTRIBUTE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export class MoneyDto {
  @IsString() @Matches(AMOUNT) amount!: string;
  @IsString() @IsIn(['IRR']) currency!: 'IRR';
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

export class AttributeOptionCreateDto {
  @IsString() @MinLength(2) @Matches(ATTRIBUTE_CODE) @MaxLength(40) @IsNotIn(['new', 'edit', 'all']) code!: string;
  @IsString() @MaxLength(150) label!: string;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

export class AttributeDefinitionCreateDto {
  @IsString() @MinLength(2) @Matches(ATTRIBUTE_CODE) @MaxLength(40) @IsNotIn(['new', 'edit', 'all']) code!: string;
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @ValidateNested({ each: true }) @Type(() => AttributeOptionCreateDto) options?: AttributeOptionCreateDto[];
}

export class AttributeDefinitionUpdateDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string | null;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsInt() @Min(0) expectedVersion!: number;
}

export class AttributeOptionUpdateDto {
  @IsOptional() @IsString() @MaxLength(150) label?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsInt() @Min(0) expectedVersion!: number;
}

export class ProductVariantUpdateDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() barcode?: string | null;
  @IsOptional() @IsString() @MaxLength(150) title?: string | null;
  @IsOptional() @IsInt() @Min(0) weightGrams?: number | null;
  @IsOptional() @IsInt() @Min(0) lengthCm?: number | null;
  @IsOptional() @IsInt() @Min(0) widthCm?: number | null;
  @IsOptional() @IsInt() @Min(0) heightCm?: number | null;
  @IsInt() @Min(0) expectedVersion!: number;
}

export class ProductVariantStatusDto {
  @IsEnum(['ACTIVE', 'INACTIVE', 'ARCHIVED']) status!: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  @IsInt() @Min(0) expectedVersion!: number;
}

export class VariantPriceUpdateDto {
  @ValidateNested() @Type(() => MoneyDto) costPrice!: MoneyDto;
  @ValidateNested() @Type(() => MoneyDto) salePrice!: MoneyDto;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsDateString() effectiveAt?: string;
  @IsInt() @Min(0) expectedVersion!: number;
}
