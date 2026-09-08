import { ServiceUnavailableException } from '@nestjs/common';
import type {
  SmsDiagnostics,
  SmsSendOutcome,
  SmsSettingsSnapshot,
} from '@iranyaragh/contracts';
import type { SmsSettingsStore } from './sms-settings.port';

const UNCONFIGURED_SNAPSHOT: SmsSettingsSnapshot = Object.freeze({
  version: 0,
  updatedAt: null,
  settings: {
    enabled: false,
    environment: 'production' as const,
    templateId: null,
    senderLine: null,
    timeoutMs: 5_000,
    deliveryStatusEnabled: false,
    outageMode: true,
    maintenanceMessage: null,
    alertThresholds: null,
  },
  secret: { configured: false, masked: null, validated: false, lastRotatedAt: null },
});

const UNCONFIGURED_DIAGNOSTICS: SmsDiagnostics = Object.freeze({
  providerHealth: 'not_configured',
  circuitState: 'unknown',
  lastSuccessfulSendAt: null,
  lastErrorClass: 'not_configured',
});

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'SMS provider settings are not configured by an active provider adapter.',
  });
}

export class DisconnectedSmsSettingsStore implements SmsSettingsStore {
  async read(): Promise<SmsSettingsSnapshot> {
    return UNCONFIGURED_SNAPSHOT;
  }

  async update(): Promise<SmsSettingsSnapshot> {
    return unavailable();
  }

  async rotateSecret(): Promise<{ lastRotatedAt: string }> {
    return unavailable();
  }

  async clearSecret(): Promise<{ clearedAt: string }> {
    return unavailable();
  }

  async submitTestSend(): Promise<SmsSendOutcome> {
    return unavailable();
  }

  async diagnostics(): Promise<SmsDiagnostics> {
    return UNCONFIGURED_DIAGNOSTICS;
  }
}