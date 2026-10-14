import { BadRequestException } from '@nestjs/common';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { InventoryCostMethod, InventoryCostPolicyUpdate } from '@iranyaragh/contracts';

export class InventoryCostPolicyDto implements InventoryCostPolicyUpdate {
  @ValidateIf((_object, value) => value !== null) @IsIn(['FIFO', 'MOVING_WEIGHTED_AVERAGE']) method!: InventoryCostMethod | null;
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number | null;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export function costPolicyInput(raw: InventoryCostPolicyUpdate): InventoryCostPolicyUpdate {
  const invalid = () => new BadRequestException({ code: 'VALIDATION_ERROR', message: 'An explicit cost method, current version and bounded plain-text reason are required.' });
  if (!raw || ![null, 'FIFO', 'MOVING_WEIGHTED_AVERAGE'].includes(raw.method) ||
    (raw.expectedVersion !== null && (!Number.isInteger(raw.expectedVersion) || raw.expectedVersion < 1 || raw.expectedVersion > 2147483646)) ||
    typeof raw.reason !== 'string') throw invalid();
  const reason = raw.reason.trim().normalize('NFC');
  if (!reason || reason.length > 500 || /[\p{Cc}\u202a-\u202e\u2066-\u2069<>]/u.test(reason)) throw invalid();
  return { method: raw.method, expectedVersion: raw.expectedVersion, reason };
}
