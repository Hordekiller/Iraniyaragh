import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  SmsAlertThresholdsDto,
  SmsSettingsClearSecretDto,
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
      expectedVersion: 3,
      patch: {
        enabled: true,
        templateId: 1_000_001,
        senderLine: '30007220',
        timeoutMs: 5_000,
        deliveryStatusEnabled: true,
        outageMode: false,
        maintenanceMessage: 'Maintenance window',
        alertThresholds: { failureWindowMinutes: 15, failureCount: 5 },
      },
    });
    expect(await errorsOf(dto)).toHaveLength(0);
  });

  it('requires a non-negative integer expectedVersion', async () => {
    const noVersion = plainToInstance(SmsSettingsUpdateDto, { patch: { enabled: true } });
    const negative = plainToInstance(SmsSettingsUpdateDto, { expectedVersion: -1, patch: {} });
    const fractional = plainToInstance(SmsSettingsUpdateDto, { expectedVersion: 1.5, patch: {} });
    expect(await errorsOf(noVersion)).not.toHaveLength(0);
    expect(await errorsOf(negative)).not.toHaveLength(0);
    expect(await errorsOf(fractional)).not.toHaveLength(0);
  });

  it('treats templateId as bounded integers only', async () => {
    const numeric = plainToInstance(SmsSettingsUpdateDto, { expectedVersion: 1, patch: { templateId: 1_000_001 } });
    const nonNumeric = plainToInstance(SmsSettingsUpdateDto, { expectedVersion: 1, patch: { templateId: 'verify-code' } });
    const oversized = plainToInstance(SmsSettingsUpdateDto, {
      expectedVersion: 1,
      patch: { templateId: 9_999_999_999_999 },
    });
    expect(await errorsOf(numeric)).toHaveLength(0);
    expect(await errorsOf(nonNumeric)).not.toHaveLength(0);
    expect(await errorsOf(oversized)).not.toHaveLength(0);
  });

  it('allows empty sender/message strings as explicit clears and rejects malformed sender lines', async () => {
    const clear = plainToInstance(SmsSettingsUpdateDto, {
      expectedVersion: 1,
      patch: { senderLine: '', maintenanceMessage: '' },
    });
    expect(await errorsOf(clear)).toHaveLength(0);

    const bad = plainToInstance(SmsSettingsUpdateDto, { expectedVersion: 1, patch: { senderLine: 'has space' } });
    expect(await errorsOf(bad)).not.toHaveLength(0);
  });

  it('validates alert threshold bounds', async () => {
    const bad = plainToInstance(SmsSettingsUpdateDto, {
      expectedVersion: 1,
      patch: { alertThresholds: { failureWindowMinutes: 0, failureCount: 100_000 } },
    });
    expect(await errorsOf(bad)).not.toHaveLength(0);
  });
});

describe('SmsSettingsRotateSecretDto', () => {
  it('requires a non-blank secret, explicit confirmation and an idempotency key', async () => {
    const valid = plainToInstance(SmsSettingsRotateSecretDto, {
      secret: '0123456789abcdef',
      confirm: true,
      idempotencyKey: 'rotate-2026-09-08-a1',
    });
    expect(await errorsOf(valid)).toHaveLength(0);

    const blank = plainToInstance(SmsSettingsRotateSecretDto, {
      secret: '',
      confirm: true,
      idempotencyKey: 'rotate-2026-09-08-a1',
    });
    expect(await errorsOf(blank)).not.toHaveLength(0);

    const unconfirmed = plainToInstance(SmsSettingsRotateSecretDto, {
      secret: '0123456789abcdef',
      confirm: false,
      idempotencyKey: 'rotate-2026-09-08-a1',
    });
    expect(await errorsOf(unconfirmed)).toHaveLength(0);

    const nonBoolean = plainToInstance(SmsSettingsRotateSecretDto, {
      secret: '0123456789abcdef',
      confirm: 'yes',
      idempotencyKey: 'rotate-2026-09-08-a1',
    });
    expect(await errorsOf(nonBoolean)).not.toHaveLength(0);

    const noKey = plainToInstance(SmsSettingsRotateSecretDto, { secret: '0123456789abcdef', confirm: true });
    expect(await errorsOf(noKey)).not.toHaveLength(0);
  });
});

describe('SmsSettingsClearSecretDto', () => {
  it('requires explicit confirmation and an idempotency key', async () => {
    const valid = plainToInstance(SmsSettingsClearSecretDto, { confirm: true, idempotencyKey: 'clear-2026-09-08-b2' });
    const unconfirmed = plainToInstance(SmsSettingsClearSecretDto, { confirm: false, idempotencyKey: 'clear-2026-09-08-b2' });
    const noKey = plainToInstance(SmsSettingsClearSecretDto, { confirm: true });
    expect(await errorsOf(valid)).toHaveLength(0);
    expect(await errorsOf(unconfirmed)).toHaveLength(0);
    expect(await errorsOf(noKey)).not.toHaveLength(0);
  });
});

describe('SmsSettingsTestSendDto', () => {
  it('accepts only an explicit confirmation and an idempotency key, with no destination input', async () => {
    const valid = plainToInstance(SmsSettingsTestSendDto, { confirm: true, idempotencyKey: 'test-2026-09-08-c3' });
    const unconfirmed = plainToInstance(SmsSettingsTestSendDto, { confirm: false, idempotencyKey: 'test-2026-09-08-c3' });
    const withInput = plainToInstance(SmsSettingsTestSendDto, {
      confirm: true,
      idempotencyKey: 'test-2026-09-08-c3',
      parameters: { Code: '123456' },
    });
    expect(await errorsOf(valid)).toHaveLength(0);
    expect(await errorsOf(unconfirmed)).toHaveLength(0);
    expect(await errorsOf(withInput)).toHaveLength(0);
  });
});

describe('SmsAlertThresholdsDto', () => {
  it('enforces numeric bounds', async () => {
    const dto = plainToInstance(SmsAlertThresholdsDto, { failureWindowMinutes: 1500, failureCount: 0 });
    expect(await errorsOf(dto)).not.toHaveLength(0);
  });
});