import type {
  SmsDiagnostics,
  SmsSendOutcome,
  SmsSettingsEditableFields,
  SmsSettingsSnapshot,
  SmsValidation,
} from '@iranyaragh/contracts';

export const SMS_SETTINGS_STORE = Symbol('SMS_SETTINGS_STORE');

export type SmsSettingsUpdateInput = {
  expectedVersion: number;
  patch: Partial<SmsSettingsEditableFields>;
};

export interface SmsSettingsStore {
  read(): Promise<SmsSettingsSnapshot>;

  update(input: SmsSettingsUpdateInput, requestId: string): Promise<SmsSettingsSnapshot>;

  rotateSecret(secret: string, idempotencyKey: string, requestId: string): Promise<{ lastRotatedAt: string }>;

  clearSecret(idempotencyKey: string, requestId: string): Promise<{ clearedAt: string }>;

  submitTestSend(idempotencyKey: string, requestId: string): Promise<SmsSendOutcome>;

  validateConfiguration(idempotencyKey: string, requestId: string): Promise<SmsValidation>;

  diagnostics(): Promise<SmsDiagnostics>;
}