import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { SupplierCreateRequest, SupplierUpdateRequest } from '@iranyaragh/contracts';

const trim = ({ value }: TransformFnParams) => typeof value === 'string' ? value.trim() : value;
const code = ({ value }: TransformFnParams) => typeof value === 'string' ? value.trim().toUpperCase() : value;
const nullableTrim = ({ value }: TransformFnParams) => typeof value === 'string' ? (value.trim() || null) : value;
const optionalBoolean = ({ value }: TransformFnParams) => value === 'true' ? true : value === 'false' ? false : value;

export class SupplierListQueryDto {
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class SupplierCreateDto implements SupplierCreateRequest {
  @Transform(code) @IsString() @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/u) code!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) mobile?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) phone?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) nationalId?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) economicCode?: string | null;
}

export class SupplierUpdateDto implements SupplierUpdateRequest {
  @IsInt() @Min(0) expectedVersion!: number;
  @ValidateIf((_object, value) => value !== undefined) @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) mobile?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) phone?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) nationalId?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(32) economicCode?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isActive?: boolean;
}
