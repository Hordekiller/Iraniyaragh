import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import type { CreditAdjustmentRequest, CreditOpeningRequest, CreditPolicyRequest, CreditReceiptRequest, CreditReversalRequest } from '@iranyaragh/contracts';

export class CreditPageDto {
  @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class CreditPolicyDto implements CreditPolicyRequest {
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(0) @Max(2_147_483_647) expectedVersion!: number | null;
  @IsIn(['ACTIVE', 'SUSPENDED']) status!: 'ACTIVE' | 'SUSPENDED';
  @IsString() @Matches(/^(0|[1-9][0-9]{0,18})$/u) creditLimit!: string;
  @IsInt() @Min(0) @Max(365) termsDays!: number;
}
export class CreditVersionDto {
  @IsInt() @Min(0) @Max(2_147_483_647) expectedVersion!: number;
}
export class CreditOpeningDto extends CreditVersionDto implements CreditOpeningRequest {
  @IsString() @Matches(/^[1-9][0-9]{0,18}$/u) amount!: string;
  @IsDateString({ strict: true }) issuedAt!: string;
  @IsDateString({ strict: true }) dueAt!: string;
  @IsString() @MinLength(1) @MaxLength(128) sourceReference!: string;
}
export class CreditAllocationDto {
  @IsString() @MinLength(1) @MaxLength(128) documentId!: string;
  @IsString() @Matches(/^[1-9][0-9]{0,18}$/u) amount!: string;
}
export class CreditReceiptDto extends CreditVersionDto implements CreditReceiptRequest {
  @IsString() @Matches(/^[1-9][0-9]{0,18}$/u) amount!: string;
  @IsIn(['CASH', 'BANK_TRANSFER']) method!: 'CASH' | 'BANK_TRANSFER';
  @IsDateString({ strict: true }) effectiveAt!: string;
  @IsString() @MinLength(1) @MaxLength(128) evidenceReference!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreditAllocationDto) allocations!: CreditAllocationDto[];
}
export class CreditReversalDto extends CreditVersionDto implements CreditReversalRequest {
  @IsDateString({ strict: true }) effectiveAt!: string;
  @IsString() @MinLength(1) @MaxLength(128) evidenceReference!: string;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class CreditAdjustmentDto extends CreditReversalDto implements CreditAdjustmentRequest {
  @IsIn(['DEBIT_ADJUSTMENT', 'CREDIT_NOTE']) kind!: 'DEBIT_ADJUSTMENT' | 'CREDIT_NOTE';
  @IsString() @Matches(/^[1-9][0-9]{0,18}$/u) amount!: string;
}
