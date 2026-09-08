import type {
  SmsDiagnostics,
  SmsSendOutcome,
  SmsSettingsFields,
  SmsSettingsSnapshot,
} from '@iranyaragh/contracts';

export const SMS_SETTINGS_STORE = Symbol('SMS_SETTINGS_STORE');

export interface SmsSettingsStore {
  read(): Promise<SmsSettingsSnapshot>;
  update(input: Partial<SmsSettingsFields>): Promise<SmsSettingsSnapshot>;
  rotateSecret(apiKey: string): Promise<{ lastRotatedAt: string }>;
  clearSecret(): Promise<{ clearedAt: string }>;
  submitTestSend(parameters: Readonly<Record<string, string>>): Promise<SmsSendOutcome>;
  diagnostics(): Promise<SmsDiagnostics>;
}