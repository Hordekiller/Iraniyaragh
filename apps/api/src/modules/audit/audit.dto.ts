import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { AuditLogFilters } from '@iranyaragh/contracts';

const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export class AuditLogListQueryDto implements AuditLogFilters {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsString() @MaxLength(150) action?: string;
  @IsOptional() @IsString() @MaxLength(150) entityType?: string;
  @IsOptional() @IsString() @MaxLength(100) entityId?: string;
  @IsOptional() @IsString() @MaxLength(100) actorId?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(ISO_INSTANT_PATTERN) createdFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(ISO_INSTANT_PATTERN) createdToExclusive?: string;
}