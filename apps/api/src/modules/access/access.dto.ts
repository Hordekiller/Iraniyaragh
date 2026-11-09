import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: TransformFnParams) => (typeof value === 'string' ? value.trim() : value);
const nullableTrim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() || null : value;

export const ACCESS_ROLE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
export const ACCESS_PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)*$/u;

export class AccessRoleListQueryDto {}

export class AccessUserListQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
}

export class AccessRoleHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
}

export class AccessRoleCreateDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(ACCESS_ROLE_KEY_PATTERN, {
    message: 'key must be lowercase letters, digits, dots, dashes or underscores starting with a letter.',
  })
  key!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(1_000)
  description?: string | null;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  @Matches(ACCESS_PERMISSION_KEY_PATTERN, { each: true })
  permissionKeys!: string[];
}

export class AccessRoleUpdateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(1_000)
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class AccessPermissionsReplaceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  @Matches(ACCESS_PERMISSION_KEY_PATTERN, { each: true })
  permissionKeys!: string[];
}

export class AccessMemberAssignDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  userId!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true })
  expiresAt?: string | null;
}

export class AccessMemberRevokeDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export const ACCESS_ROLE_SORT_VALUES = ['key', 'name', 'createdAt', 'updatedAt'] as const;
export type AccessRoleSortValue = (typeof ACCESS_ROLE_SORT_VALUES)[number];

export class AccessPermissionListQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  includeInactive?: 'true' | 'false';
}
