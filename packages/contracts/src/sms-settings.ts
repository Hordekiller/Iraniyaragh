import type { ApiSuccess } from './api';

export type SmsProviderEnvironment = 'development' | 'production';

export type SmsSendStatus = 'accepted' | 'rejected' | 'rate_limited' | 'unavailable' | 'unknown';

export type SmsSettingsFields = {
  enabled: boolean;
  environment: SmsProviderEnvironment;
  templateId: string | null;
  senderLine: string | null;
  timeoutMs: number;
  deliveryStatusEnabled: boolean;
  outageMode: boolean;
  maintenanceMessage: string | null;
  alertThresholds: {
    failureWindowMinutes: number;
    failureCount: number;
  } | null;
};

export type SmsSecretStatus = {
  configured: boolean;
  masked: string | null;
  validated: boolean;
  lastRotatedAt: string | null;
};

export type SmsSettingsSnapshot = {
  version: number;
  updatedAt: string | null;
  settings: SmsSettingsFields;
  secret: SmsSecretStatus;
};

export type SmsSettingsResponse = ApiSuccess<{ snapshot: SmsSettingsSnapshot }>;

export type SmsSettingsUpdatePayload = Partial<SmsSettingsFields>;

export type SmsSettingsRotateSecretPayload = {
  apiKey: string;
  confirm: boolean;
};

export type SmsSettingsTestSendPayload = {
  parameters?: Record<string, string>;
};

export type SmsSendOutcome = {
  messageId: string | null;
  accepted: boolean;
  status: SmsSendStatus;
};

export type SmsTestSendResponse = ApiSuccess<{ outcome: SmsSendOutcome }>;

export type SmsProviderHealth = 'ok' | 'degraded' | 'down' | 'not_configured' | 'unknown';

export type SmsCircuitState = 'closed' | 'open' | 'half_open' | 'unknown';

export type SmsErrorClass = 'auth' | 'rate_limit' | 'invalid_request' | 'provider_error' | 'timeout' | 'not_configured';

export type SmsDiagnostics = {
  providerHealth: SmsProviderHealth;
  circuitState: SmsCircuitState;
  lastSuccessfulSendAt: string | null;
  lastErrorClass: SmsErrorClass | null;
};

export type SmsDiagnosticsResponse = ApiSuccess<{ diagnostics: SmsDiagnostics }>;