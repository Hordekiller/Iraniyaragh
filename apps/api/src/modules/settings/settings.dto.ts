import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const AMOUNT = /^\d{1,15}$/u;
const NATIONAL_ID = /^\d{10}$/u;
const ECONOMIC_CODE = /^\d{12}$/u;
/* eslint-disable-next-line no-control-regex */
const NO_CONTROL = new RegExp('^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]*$', 'u');

const VAT_PRESETS = [0, 900, 1000, 1200, 1600] as const;

export class MoneyDto {
  @IsString()
  @Matches(AMOUNT)
  @ApiProperty({ description: 'Non-negative integer Rials.', example: '5000000' })
  amount!: string;

  @IsString()
  @IsIn(['IRR'])
  @ApiProperty({ description: 'IRR is the only supported currency (ADR-0003).', enum: ['IRR'], example: 'IRR' })
  currency!: 'IRR';
}

export class FinancialPolicyValueDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([...VAT_PRESETS])
  @ApiProperty({
    description: 'VAT rate in basis points; 1404 budget-law default is 1000 (10 %). Only the law-preset values are permitted.',
    enum: [...VAT_PRESETS],
    example: 1000,
  })
  vatRateBp!: number;

  @IsString()
  @IsIn(['EXCLUSIVE', 'INCLUSIVE'])
  @ApiProperty({
    description: 'Whether the displayed shop price excludes or includes VAT (EC Law Art. 33 disclosure).',
    enum: ['EXCLUSIVE', 'INCLUSIVE'],
    example: 'EXCLUSIVE',
  })
  vatTreatment!: 'EXCLUSIVE' | 'INCLUSIVE';

  @IsString()
  @IsIn(['ROUND_HALF_UP'])
  @ApiProperty({
    description: 'Rounding method, locked to ROUND_HALF_UP per ADR-0003.',
    enum: ['ROUND_HALF_UP'],
    example: 'ROUND_HALF_UP',
  })
  roundingMethod!: 'ROUND_HALF_UP';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  @ApiProperty({ description: 'Maximum per-order discount in basis points of the pre-discount subtotal.', minimum: 0, maximum: 10_000, example: 5000 })
  maxDiscountOrderBp!: number;

  @ValidateNested()
  @Type(() => MoneyDto)
  @ApiProperty({ description: 'Discounts above this integer-Rial amount require an independent approver (four-eyes).', type: () => MoneyDto })
  discountApprovalThreshold!: MoneyDto;

  @ValidateNested()
  @Type(() => MoneyDto)
  @ApiProperty({ description: 'Refunds at or below this integer-Rial amount are auto-approved.', type: () => MoneyDto })
  refundAutoMax!: MoneyDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  @ApiProperty({ description: 'Maximum refundable fraction of a paid amount in basis points.', minimum: 1, maximum: 10_000, example: 10000 })
  refundMaxFractionBp!: number;

  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  @ApiProperty({
    description: 'Distance-contract withdrawal window in working days; the legal floor is 7 (EC Law Art. 37).',
    minimum: 7,
    maximum: 365,
    example: 7,
  })
  withdrawalWindowDays!: number;
}

export class SellerLegalBlockValueDto {
  @IsString()
  @MaxLength(250)
  @Matches(NO_CONTROL)
  @ApiProperty({ description: 'Registered business/trade legal name.', example: 'Iraniyaragh Bookstore' })
  legalName!: string;

  @IsOptional()
  @IsString()
  @Matches(NATIONAL_ID)
  @ApiPropertyOptional({ description: 'Iranian national ID (شناسه ملی) when the seller is a real/legal person.', nullable: true, example: '1234567890' })
  nationalId!: string | null;

  @IsOptional()
  @IsString()
  @Matches(ECONOMIC_CODE)
  @ApiPropertyOptional({ description: 'Economic code (کد اقتصادی) for VAT/e-invoice purposes.', nullable: true, example: '411234567890' })
  economicCode!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'Business address shown to consumers.', nullable: true, example: 'Tehran, ...' })
  address!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'Public contact email shown to consumers.', nullable: true, example: 'shop@example.com' })
  contactEmail!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^\+?\d{6,15}$/u)
  @ApiPropertyOptional({ description: 'Public contact phone shown to consumers.', nullable: true, example: '+982100000000' })
  contactPhone!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/[^\s]+$/u)
  @ApiPropertyOptional({ description: 'e-Namad trust-seal URL when issued (نماد اعتماد الکترونیکی).', nullable: true, example: 'https://enamad.ir/' })
  eNamadUrl!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'Withdrawal/return rights text presented to consumers (EC Law Art. 37-38).', nullable: true, example: 'You may return any distance purchase within 7 working days.' })
  withdrawalPolicyText!: string | null;
}

export class FinancialPolicySettingsUpdateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({ description: 'Optimistic concurrency version of the current financial policy snapshot.', minimum: 0, example: 0 })
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => FinancialPolicyValueDto)
  @ApiProperty({ description: 'Full financial policy value; unknown fields are rejected.', type: () => FinancialPolicyValueDto })
  value!: FinancialPolicyValueDto;
}

export class SellerLegalBlockUpdateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({ description: 'Optimistic concurrency version of the current seller legal block snapshot.', minimum: 0, example: 0 })
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => SellerLegalBlockValueDto)
  @ApiProperty({ description: 'Full seller legal block value; unknown fields are rejected.', type: () => SellerLegalBlockValueDto })
  value!: SellerLegalBlockValueDto;
}

const errorEnvelope = {
  type: 'object',
  required: ['code', 'message', 'requestId', 'statusCode'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string', description: 'Request correlation id, echoed from the x-request-id flow.' },
    statusCode: { type: 'integer' },
  },
};

export const openApiSettingsFailures = {
  unauthorized: {
    ...errorEnvelope,
    description: 'Missing, invalid, revoked or expired authentication, or stale fresh-auth window.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], example: 'AUTH_SESSION_INVALID' },
      message: { type: 'string', example: 'Authentication is required.' },
      statusCode: { type: 'integer', enum: [401], example: 401 },
    },
  },
  forbidden: {
    ...errorEnvelope,
    description: 'Authenticated but lacking the required permission or authentication level.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['FORBIDDEN'], example: 'FORBIDDEN' },
      message: { type: 'string', example: 'Access denied.' },
      statusCode: { type: 'integer', enum: [403], example: 403 },
    },
  },
  validation: {
    ...errorEnvelope,
    description: 'Request body failed schema validation (unknown, blank or out-of-range fields).',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['INVALID_REQUEST'], example: 'INVALID_REQUEST' },
      message: { type: 'string', example: 'Request validation failed.' },
      statusCode: { type: 'integer', enum: [400], example: 400 },
    },
  },
  conflict: {
    ...errorEnvelope,
    description: 'Optimistic concurrency conflict: the expectedVersion is stale and the write was rejected.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['CONFLICT'], example: 'CONFLICT' },
      message: { type: 'string', example: 'The settings changed concurrently. Refresh and retry.' },
      statusCode: { type: 'integer', enum: [409], example: 409 },
    },
  },
};

const moneySchema = {
  type: 'object',
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'string', pattern: String(AMOUNT), description: 'Non-negative integer Rials.', example: '5000000' },
    currency: { type: 'string', enum: ['IRR'], description: 'IRR is the only supported currency (ADR-0003).' },
  },
};

const financialPolicySchema = {
  type: 'object',
  required: [
    'vatRateBp',
    'vatTreatment',
    'roundingMethod',
    'maxDiscountOrderBp',
    'discountApprovalThreshold',
    'refundAutoMax',
    'refundMaxFractionBp',
    'withdrawalWindowDays',
  ],
  properties: {
    vatRateBp: { type: 'integer', enum: [...VAT_PRESETS], description: 'VAT rate in basis points; 1404 default 1000.', example: 1000 },
    vatTreatment: { type: 'string', enum: ['EXCLUSIVE', 'INCLUSIVE'], description: 'Whether displayed price excludes or includes VAT.' },
    roundingMethod: { type: 'string', enum: ['ROUND_HALF_UP'], description: 'Locked rounding per ADR-0003.' },
    maxDiscountOrderBp: { type: 'integer', minimum: 0, maximum: 10_000, example: 5000 },
    discountApprovalThreshold: moneySchema,
    refundAutoMax: moneySchema,
    refundMaxFractionBp: { type: 'integer', minimum: 1, maximum: 10_000, example: 10000 },
    withdrawalWindowDays: { type: 'integer', minimum: 7, maximum: 365, example: 7 },
  },
};

const sellerLegalBlockSchema = {
  type: 'object',
  required: ['legalName'],
  properties: {
    legalName: { type: 'string', maxLength: 250, example: 'Iraniyaragh Bookstore' },
    nationalId: { type: 'string', nullable: true, pattern: String(NATIONAL_ID), description: 'شناسه ملی' },
    economicCode: { type: 'string', nullable: true, pattern: String(ECONOMIC_CODE), description: 'کد اقتصادی' },
    address: { type: 'string', nullable: true, maxLength: 500 },
    contactEmail: { type: 'string', nullable: true, maxLength: 320 },
    contactPhone: { type: 'string', nullable: true, pattern: '^\\+?\\d{6,15}$' },
    eNamadUrl: { type: 'string', nullable: true, pattern: '^https?://[^\\s]+$', description: 'نماد اعتماد الکترونیکی' },
    withdrawalPolicyText: { type: 'string', nullable: true, maxLength: 4_000 },
  },
};

const settingEntrySchema = <T>(valueSchema: T) => ({
  type: 'object',
  required: ['key', 'group', 'description', 'isSecret', 'version', 'updatedAt', 'value'],
  properties: {
    key: { type: 'string' },
    group: { type: 'string' },
    description: { type: 'string' },
    isSecret: { type: 'boolean' },
    version: { type: 'integer', example: 0 },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
    value: valueSchema,
  },
});

export const openApiSettingsSchemas = {
  snapshotResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['settings'],
        properties: {
          settings: {
            type: 'object',
            required: ['financialPolicy', 'sellerLegalBlock'],
            properties: {
              financialPolicy: settingEntrySchema(financialPolicySchema),
              sellerLegalBlock: settingEntrySchema(sellerLegalBlockSchema),
            },
          },
        },
      },
    },
  },
  financialPolicyUpdate: {
    type: 'object',
    required: ['expectedVersion', 'value'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0, description: 'Optimistic concurrency version.', example: 0 },
      value: financialPolicySchema,
    },
  },
  sellerLegalBlockUpdate: {
    type: 'object',
    required: ['expectedVersion', 'value'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0, description: 'Optimistic concurrency version.', example: 0 },
      value: sellerLegalBlockSchema,
    },
  },
  financialPolicyEntry: settingEntrySchema(financialPolicySchema),
  sellerLegalBlockEntry: settingEntrySchema(sellerLegalBlockSchema),
};