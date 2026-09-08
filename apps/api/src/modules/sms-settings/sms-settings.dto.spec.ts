import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  SmsAlertThresholdsDto,
  SmsSettingsRotateSecretDto,
  SmsSettingsTestSendDto,
  SmsSettingsUpdateDto,
} from './sms-settings.dto';

function errorsOf(input: object) {
  return validate(input);
}

describe('SmsSettingsUpdateDto', () => {
  it('accepts a fully valid settings payload', async () => {
    const dto = plainToInstance(SmsSettingsUpdateDto, {
      enabled: true,
      environment: 'production',
      templateId: 'verify-code',
      senderLine: '30007220',
      timeoutMs: 5_000,
      deliveryStatusEnabled: true,
      outageMode: false,
      maintenanceMessage: 'Maintenance window',
      alertThresholds: { failureWindowMinutes: 15, failureCount: 5 },
    });
    expect(await errorsOf(dto)).toHaveLength(0);
  });

  it('rejects out-of-server-bounds timeout values', async () => {
    const tooSlow = plainToInstance(SmsSettingsUpdateDto, { timeoutMs: 100 });
    const tooFast = plainToInstance(SmsSettingsUpdateDto, { timeoutMs: 60_000 });
    expect(await errorsOf(tooSlow)).not.toHaveLength(0);
    expect(await errorsOf(tooFast)).not.toHaveLength(0);
  });

  it('allows empty strings for clearable fields and validates template id shape', async () => {
    const clearable = plainToInstance(SmsSettingsUpdateDto, { templateId: '', senderLine: '', maintenanceMessage: '' });
    expect(await errorsOf(clearable)).toHaveLength(0);

    const malformed = plainToInstance(SmsSettingsUpdateDto, { templateId: 'has space' });
    expect(await errorsOf(malformed)).not.toHaveLength(0);
  });

  it('validates alert threshold bounds', async () => {
    const bad = plainToInstance(SmsSettingsUpdateDto, {
      alertThresholds: { failureWindowMinutes: 0, failureCount: 100_000 },
    });
    expect(await errorsOf(bad)).not.toHaveLength(0);
  });

  it('rejects unknown environment values', async () => {
    const dto = plainToInstance(SmsSettingsUpdateDto, { environment: 'staging' });
    expect(await errorsOf(dto)).not.toHaveLength(0);
  });
});

describe('SmsSettingsRotateSecretDto', () => {
  it('accepts any boolean confirmation (the service enforces the gate) and validates the secret', async () => {
    const valid = plainToInstance(SmsSettingsRotateSecretDto, { apiKey: '0123456789abcdef', confirm: true });
    expect(await errorsOf(valid)).toHaveLength(0);

    const short = plainToInstance(SmsSettingsRotateSecretDto, { apiKey: 'x', confirm: true });
    expect(await errorsOf(short)).not.toHaveLength(0);

    const nonBoolean = plainToInstance(SmsSettingsRotateSecretDto, { apiKey: '0123456789abcdef', confirm: 'yes' });
    expect(await errorsOf(nonBoolean)).not.toHaveLength(0);
  });
});

describe('SmsAlertThresholdsDto', () => {
  it('enforces numeric bounds', async () => {
    const dto = plainToInstance(SmsAlertThresholdsDto, { failureWindowMinutes: 1500, failureCount: 0 });
    expect(await errorsOf(dto)).not.toHaveLength(0);
  });
});

describe('SmsSettingsTestSendDto', () => {
  it('accepts an optional string-parameter map', async () => {
    const withParams = plainToInstance(SmsSettingsTestSendDto, { parameters: { Code: '123456' } });
    const empty = plainToInstance(SmsSettingsTestSendDto, {});
    expect(await errorsOf(withParams)).toHaveLength(0);
    expect(await errorsOf(empty)).toHaveLength(0);
  });
});