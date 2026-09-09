import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SENDER_LINE = /^(?:|\d{1,16})$/u;
const IDEMPOTENCY_KEY = /^[\w-]{8,96}$/u;
/* eslint-disable-next-line no-control-regex */
const NO_PADDING_OR_CONTROL = new RegExp('^[^\\s\\u0000-\\u001F\\u007F]+$', 'u');

export class SmsAlertThresholdsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_440)
  @ApiProperty({
    description: 'Continuous failure window in minutes used to compute the alert rate.',
    minimum: 1,
    maximum: 1_440,
    example: 15,
  })
  failureWindowMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  @ApiProperty({
    description: 'Number of provider failures within the window that trips the alert.',
    minimum: 1,
    maximum: 10_000,
    example: 5,
  })
  failureCount!: number;
}

export class SmsSettingsPatchDto {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Master switch for the SMS/OTP provider.', example: true })
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  @ApiPropertyOptional({
    description: 'SMS.ir verification template ID. Null clears the assigned template.',
    nullable: true,
    example: 1_000_001,
  })
  templateId?: number | null;

  @IsOptional()
  @IsString()
  @Matches(SENDER_LINE)
  @ApiPropertyOptional({
    description: 'Sender line identifier (digits only). Null or empty clears it.',
    nullable: true,
    example: '30007220',
  })
  senderLine?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(10_000)
  @ApiPropertyOptional({
    description: 'Provider request timeout in milliseconds within enforced bounds.',
    minimum: 500,
    maximum: 10_000,
    example: 5_000,
  })
  timeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Polling switch for delivery-status reporting.', example: true })
  deliveryStatusEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Outage mode routes traffic to the maintenance message.', example: false })
  outageMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiPropertyOptional({
    description: 'Operator-facing maintenance message shown during outage mode.',
    nullable: true,
    maxLength: 500,
  })
  maintenanceMessage?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SmsAlertThresholdsDto)
  @ApiPropertyOptional({ description: 'Alert thresholds. Null clears the alert configuration.', nullable: true, type: () => SmsAlertThresholdsDto })
  alertThresholds?: SmsAlertThresholdsDto | null;
}

export class SmsSettingsUpdateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({
    description: 'Optimistic concurrency version of the current settings snapshot.',
    minimum: 0,
    example: 3,
  })
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => SmsSettingsPatchDto)
  @ApiProperty({ description: 'Editable settings patch. Unknown fields are rejected.', type: () => SmsSettingsPatchDto })
  patch!: SmsSettingsPatchDto;
}

export class SmsSettingsRotateSecretDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  @Matches(NO_PADDING_OR_CONTROL, {
    message: 'secret must not contain whitespace or control characters and must not be padded.',
  })
  @ApiProperty({
    description:
      'Write-only SMS provider API key. Stored by the deployment secret manager, never returned, ' +
      'and never logged. Must not contain whitespace or control characters; the exact value is ' +
      'accepted, never normalized or trimmed.',
    minLength: 16,
    maxLength: 512,
    writeOnly: true,
  })
  secret!: string;

  @IsBoolean()
  @ApiProperty({ description: 'Explicit operator confirmation is required to rotate the secret.', example: true })
  confirm!: boolean;

  @IsString()
  @Matches(IDEMPOTENCY_KEY)
  @ApiProperty({
    description: 'Client-supplied idempotency key (8-96 word/hyphen characters) guarding replay of a single rotation.',
    pattern: String(IDEMPOTENCY_KEY),
    example: 'rotate-2026-09-08-a1',
  })
  idempotencyKey!: string;
}

export class SmsSettingsClearSecretDto {
  @IsBoolean()
  @ApiProperty({ description: 'Explicit operator confirmation is required to clear the secret.', example: true })
  confirm!: boolean;

  @IsString()
  @Matches(IDEMPOTENCY_KEY)
  @ApiProperty({
    description: 'Client-supplied idempotency key guarding replay of a single clearing.',
    pattern: String(IDEMPOTENCY_KEY),
    example: 'clear-2026-09-08-b2',
  })
  idempotencyKey!: string;
}

export class SmsSettingsTestSendDto {
  @IsBoolean()
  @ApiProperty({ description: 'Explicit operator confirmation is required to send the controlled test.', example: true })
  confirm!: boolean;

  @IsString()
  @Matches(IDEMPOTENCY_KEY)
  @ApiProperty({
    description: 'Client-supplied idempotency key guarding replay of a single controlled test send.',
    pattern: String(IDEMPOTENCY_KEY),
    example: 'test-2026-09-08-c3',
  })
  idempotencyKey!: string;
}

export class SmsSettingsFieldsDto {
  @ApiProperty({ description: 'Master switch for the SMS/OTP provider.', example: true })
  enabled!: boolean;

  @ApiProperty({ description: 'SMS.ir verification template ID.', nullable: true, example: 1_000_001 })
  templateId!: number | null;

  @ApiProperty({ description: 'Sender line identifier (digits only).', nullable: true, example: '30007220' })
  senderLine!: string | null;

  @ApiProperty({ description: 'Provider request timeout in milliseconds.', example: 5_000 })
  timeoutMs!: number;

  @ApiProperty({ description: 'Polling switch for delivery-status reporting.', example: true })
  deliveryStatusEnabled!: boolean;

  @ApiProperty({ description: 'Outage mode routes traffic to the maintenance message.', example: false })
  outageMode!: boolean;

  @ApiProperty({ description: 'Operator-facing maintenance message shown during outage mode.', nullable: true, maxLength: 500 })
  maintenanceMessage!: string | null;

  @ApiProperty({ description: 'Alert thresholds.', nullable: true, type: () => SmsAlertThresholdsDto })
  alertThresholds!: SmsAlertThresholdsDto | null;

  @ApiProperty({ description: 'Provider environment derived from deployment configuration.', enum: ['development', 'production', 'unknown'], example: 'production' })
  environment!: string;
}

export const openApiSmsBodies = {
  update: {
    type: 'object',
    required: ['expectedVersion', 'patch'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0, description: 'Optimistic concurrency version of the current settings snapshot.', example: 3 },
      patch: {
        type: 'object',
        description: 'Editable settings patch. Unknown fields are rejected.',
        properties: {
          enabled: { type: 'boolean', description: 'Master switch for the SMS/OTP provider.', example: true },
          templateId: { type: 'integer', nullable: true, description: 'SMS.ir verification template ID. Null clears the assigned template.', example: 1_000_001 },
          senderLine: { type: 'string', nullable: true, description: 'Sender line identifier (digits only). Null or empty clears it.', example: '30007220' },
          timeoutMs: { type: 'integer', minimum: 500, maximum: 10_000, description: 'Provider request timeout in milliseconds within enforced bounds.', example: 5_000 },
          deliveryStatusEnabled: { type: 'boolean', description: 'Polling switch for delivery-status reporting.', example: true },
          outageMode: { type: 'boolean', description: 'Outage mode routes traffic to the maintenance message.', example: false },
          maintenanceMessage: { type: 'string', nullable: true, maxLength: 500, description: 'Operator-facing maintenance message shown during outage mode.' },
          alertThresholds: {
            type: 'object',
            nullable: true,
            required: ['failureWindowMinutes', 'failureCount'],
            properties: {
              failureWindowMinutes: { type: 'integer', minimum: 1, maximum: 1_440, description: 'Continuous failure window in minutes used to compute the alert rate.', example: 15 },
              failureCount: { type: 'integer', minimum: 1, maximum: 10_000, description: 'Number of provider failures within the window that trips the alert.', example: 5 },
            },
          },
        },
      },
    },
  },
  rotateSecret: {
    type: 'object',
    required: ['secret', 'confirm', 'idempotencyKey'],
    properties: {
      secret: { type: 'string', minLength: 16, maxLength: 512, description: 'Write-only SMS provider API key. Must not contain whitespace or control characters; the exact value is accepted, never normalized or trimmed.', example: 'xxxxxxxxxxxxxxxx-0000' },
      confirm: { type: 'boolean', description: 'Explicit operator confirmation is required to rotate the secret.', example: true },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 96, description: 'Client-supplied idempotency key (8-96 word/hyphen characters) guarding replay of a single rotation.', example: 'rotate-2026-09-08-a1' },
    },
  },
  clearSecret: {
    type: 'object',
    required: ['confirm', 'idempotencyKey'],
    properties: {
      confirm: { type: 'boolean', description: 'Explicit operator confirmation is required to clear the secret.', example: true },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 96, description: 'Client-supplied idempotency key guarding replay of a single clearing.', example: 'clear-2026-09-08-b2' },
    },
  },
  testSend: {
    type: 'object',
    required: ['confirm', 'idempotencyKey'],
    properties: {
      confirm: { type: 'boolean', description: 'Explicit operator confirmation is required to send the controlled test.', example: true },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 96, description: 'Client-supplied idempotency key guarding replay of a single controlled test send.', example: 'test-2026-09-08-c3' },
    },
  },
};

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

/**
 * Reusable stable failure envelopes for the SMS settings operations. These mirror
 * the runtime behavior of the global exception filter and the auth guard; the raw
 * provider message/body and any secret material are never included.
 */
export const openApiSmsFailures = {
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
  unprocessable: {
    ...errorEnvelope,
    description: 'Domain-level rejection: missing explicit confirmation or an unsupported operation.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['UNPROCESSABLE', 'OPERATION_UNSUPPORTED'], example: 'UNPROCESSABLE' },
      message: { type: 'string', example: 'The request cannot be processed.' },
      statusCode: { type: 'integer', enum: [422], example: 422 },
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
  upstream: {
    ...errorEnvelope,
    description: 'The provider store or upstream service is unavailable; retry is only safe with the same idempotency key.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['UPSTREAM_UNAVAILABLE'], example: 'UPSTREAM_UNAVAILABLE' },
      message: { type: 'string', example: 'The service is temporarily unavailable.' },
      statusCode: { type: 'integer', enum: [503], example: 503 },
    },
  },
};

export const openApiSmsSchemas = {
  settingsResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['snapshot'],
        properties: {
          snapshot: {
            type: 'object',
            required: ['version', 'updatedAt', 'settings', 'secret', 'secretBackend'],
            properties: {
              version: { type: 'integer', description: 'Optimistic concurrency version.', example: 3 },
              updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'ISO-8601 instant of the last settings update.', example: '2026-09-08T09:00:00.000Z' },
              settings: {
                type: 'object',
                required: ['enabled', 'templateId', 'senderLine', 'timeoutMs', 'deliveryStatusEnabled', 'outageMode', 'maintenanceMessage', 'alertThresholds', 'environment'],
                properties: {
                  enabled: { type: 'boolean', description: 'Master switch for the SMS/OTP provider.', example: true },
                  templateId: { type: 'integer', nullable: true, description: 'SMS.ir verification template ID.', example: 1_000_001 },
                  senderLine: { type: 'string', nullable: true, description: 'Sender line identifier (digits only).', example: '30007220' },
                  timeoutMs: { type: 'integer', description: 'Provider request timeout in milliseconds.', example: 5_000 },
                  deliveryStatusEnabled: { type: 'boolean', description: 'Polling switch for delivery-status reporting.', example: true },
                  outageMode: { type: 'boolean', description: 'Outage mode routes traffic to the maintenance message.', example: false },
                  maintenanceMessage: { type: 'string', nullable: true, description: 'Operator-facing maintenance message shown during outage mode.', example: 'Scheduled maintenance' },
                  alertThresholds: {
                    type: 'object',
                    nullable: true,
                    required: ['failureWindowMinutes', 'failureCount'],
                    properties: {
                      failureWindowMinutes: { type: 'integer', minimum: 1, maximum: 1_440, description: 'Continuous failure window in minutes used to compute the alert rate.', example: 15 },
                      failureCount: { type: 'integer', minimum: 1, maximum: 10_000, description: 'Number of provider failures within the window that trips the alert.', example: 5 },
                    },
                  },
                  environment: { type: 'string', enum: ['development', 'production', 'unknown'], description: 'Provider environment derived from deployment configuration.', example: 'production' },
                },
              },
              secret: {
                type: 'object',
                required: ['configured', 'masked', 'validated', 'lastRotatedAt'],
                properties: {
                  configured: { type: 'boolean', description: 'Whether a secret is currently present in the secret backend.', example: true },
                  masked: { type: 'string', nullable: true, description: 'Last four characters only; the raw secret is never returned.', example: '7988' },
                  validated: { type: 'boolean', description: 'Whether the configured secret has been validated.', example: true },
                  lastRotatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'ISO-8601 instant of the last rotation, if any.', example: '2026-09-08T09:00:00.000Z' },
                },
              },
              secretBackend: { type: 'string', enum: ['writable', 'read_only'], description: 'Secret backend capability.', example: 'writable' },
            },
          },
        },
      },
    },
  },
  testSendResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['outcome'],
        properties: {
          outcome: {
            type: 'object',
            required: ['messageId', 'status'],
            properties: {
              messageId: { type: 'string', nullable: true, description: 'Provider message id if known; null on non-delivery outcomes.', example: 'SMSIR-0001' },
              status: { type: 'string', enum: ['accepted', 'rejected', 'rate_limited', 'unavailable', 'unknown_result'], description: 'Delivery outcome.', example: 'accepted' },
            },
          },
        },
      },
    },
  },
  validateResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['validation'],
        properties: {
          validation: {
            type: 'object',
            required: ['checked', 'providerHealth', 'lastCheckedAt', 'errorClass'],
            properties: {
              checked: { type: 'boolean', description: 'Whether a validation check was completed.', example: true },
              providerHealth: { type: 'string', enum: ['ok', 'degraded', 'down', 'not_configured', 'unknown'], description: 'Provider health.', example: 'ok' },
              lastCheckedAt: { type: 'string', format: 'date-time', nullable: true, description: 'ISO-8601 instant of the last validation.', example: '2026-09-08T09:00:00.000Z' },
              errorClass: { type: 'string', nullable: true, enum: ['auth', 'rate_limit', 'invalid_request', 'provider_error', 'timeout', 'not_configured'], description: 'Sanitized error category when unhealthy; null when healthy.' },
            },
          },
        },
      },
    },
  },
  diagnosticsResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['diagnostics'],
        properties: {
          diagnostics: {
            type: 'object',
            required: ['providerHealth', 'circuitState', 'lastSuccessfulSendAt', 'lastErrorClass'],
            properties: {
              providerHealth: { type: 'string', enum: ['ok', 'degraded', 'down', 'not_configured', 'unknown'], description: 'Provider health.', example: 'ok' },
              circuitState: { type: 'string', enum: ['closed', 'open', 'half_open', 'unknown'], description: 'Circuit breaker state.', example: 'closed' },
              lastSuccessfulSendAt: { type: 'string', format: 'date-time', nullable: true, description: 'ISO-8601 instant of the last successful send, if any.', example: '2026-09-08T09:00:00.000Z' },
              lastErrorClass: { type: 'string', nullable: true, enum: ['auth', 'rate_limit', 'invalid_request', 'provider_error', 'timeout', 'not_configured'], description: 'Last recorded sanitized error category, if any.' },
            },
          },
        },
      },
    },
  },
};