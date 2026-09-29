import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CustomerNoteVisibility, CustomerStatus } from '@prisma/client';
import type { CustomerNoteVisibility as ContractNoteVisibility, CustomerStatus as ContractCustomerStatus } from '@iranyaragh/contracts';

// Derived from the Prisma enum rather than the contracts package. The API must
// never `require()` `@iranyaragh/contracts` at runtime: that package is
// TypeScript source only and is not resolvable by Node's ESM loader, so a value
// import there crashes the process on boot. Keep contracts imports type-only.
export const CUSTOMER_STATUS_VALUES = Object.values(CustomerStatus);
export const CUSTOMER_NOTE_VISIBILITY_VALUES = Object.values(CustomerNoteVisibility);

type CustomerStatusValue = ContractCustomerStatus;
type CustomerNoteVisibilityValue = ContractNoteVisibility;

const trim = ({ value }: TransformFnParams) => (typeof value === 'string' ? value.trim() : value);
const nullableTrim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() || null : value;
const optionalBoolean = ({ value }: TransformFnParams) => (value === 'true' ? true : value === 'false' ? false : value);
const upper = ({ value }: TransformFnParams) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

/** Iranian digits are common in operator input; fold them to ASCII before validation. */
const toEnglishDigits = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.replace(/[\u06F0-\u06F9]/gu, (d) => String(d.charCodeAt(0) - 0x06F0)) : value;

const digitsOnly = ({ value }: TransformFnParams) =>
  typeof value === 'string'
    ? value.replace(/[\s\-()_]/gu, '').replace(/[\u06F0-\u06F9]/gu, (d) => String(d.charCodeAt(0) - 0x06F0))
    : value;

export const CUSTOMER_SORT_FIELDS = ['createdAt', 'updatedAt', 'mobile', 'firstName', 'lastName', 'orderCount'] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export class CustomerListQueryDto {
  @IsOptional()
  @Transform(toEnglishDigits)
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsIn(CUSTOMER_STATUS_VALUES)
  status?: CustomerStatusValue;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  hasUserAccount?: boolean;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(CUSTOMER_SORT_FIELDS)
  sortBy?: CustomerSortField;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
}

export class CustomerCreateDto {
  /** Accepts the local/compact/E.164 Iranian forms; stored as canonical E.164. */
  @Transform(digitsOnly) @IsString() @MinLength(10) @MaxLength(20) mobile!: string;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(100) firstName?: string | null;
  @IsOptional() @Transform(nullableTrim) @IsString() @MaxLength(100) lastName?: string | null;
}

export class CustomerUpdateDto {
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(nullableTrim) @IsString() @MaxLength(100) firstName?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(nullableTrim) @IsString() @MaxLength(100) lastName?: string | null;
}

export class CustomerAddressInputDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) label!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) receiverName!: string;
  @Transform(digitsOnly) @IsString() @MinLength(10) @MaxLength(20) mobile!: string;
  @Transform(upper) @IsString() @MinLength(1) @MaxLength(32) provinceCode!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(400) addressLine!: string;
  @IsOptional() @Transform(digitsOnly) @IsString() @MaxLength(20) postalCode?: string | null;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() isDefault?: boolean;
}

export class CustomerAddressesDto {
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CustomerAddressInputDto)
  addresses!: CustomerAddressInputDto[];
  @IsOptional() @IsIn(CUSTOMER_STATUS_VALUES) status?: CustomerStatusValue;
}

export class CustomerNoteDto {
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
  @IsIn(CUSTOMER_NOTE_VISIBILITY_VALUES) visibility!: CustomerNoteVisibilityValue;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}
