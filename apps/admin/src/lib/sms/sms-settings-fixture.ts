import type {
  SmsAlertThresholds,
  SmsDiagnostics,
  SmsSecretBackendCapability,
  SmsSendOutcome,
  SmsSettingsClearSecretPayload,
  SmsSettingsRotateSecretPayload,
  SmsSettingsSnapshot,
  SmsSettingsTestSendPayload,
  SmsSettingsUpdatePayload,
  SmsValidation,
} from '@iranyaragh/contracts';
import {
  SmsInvalidInputError,
  SmsUnsupportedOperationError,
  SmsVersionConflictError,
  type SmsSettingsPort,
} from './sms-settings-port';

export type SmsSettingsFixtureOptions = {
  /** Fixed masked display value shown after a secret is configured. */
  maskedValue?: string;
  /** Deterministic clock; defaults to `Date.now()`. */
  now?: () => number;
  /** Injectable backend capability; defaults to `writable`. */
  secretBackend?: SmsSecretBackendCapability;
};

/**
 * Deterministic, contract-validated SMS settings fixture for the admin panel
 * (issue #115, mock-proceedable slice).
 *
 * Models the accepted #114/#118 behavior the UI must render:
 * - settings updates are versioned (expectedVersion compare-and-swap);
 * - the secret is write-only: only masked/configured/validated/lastRotatedAt are
 *   ever readable — the fixture never retains or returns secret material;
 * - rotate/clear/test-send require `confirm: true` and an idempotency key, and a
 *   replay of the same key returns the same outcome;
 * - a `read_only` backend answers rotate/clear with the contract-stable
 *   `OPERATION_UNSUPPORTED` instead of pretending to mutate;
 * - outage mode surfaces as a failed test send and open-circuit diagnostics.
 *
 * This is NOT a security mechanism: no real encryption or provider calls.
 */
export class SmsSettingsFixture implements SmsSettingsPort {
  private readonly maskedValue: string;
  private readonly now: () => number;
  private readonly secretBackend: SmsSecretBackendCapability;

  private version = 3;
  private updatedAt = '2026-09-01T08:00:00.000Z';
  private enabled = true;
  private templateId: number | null = 123456;
  private senderLine: string | null = null;
  private timeoutMs = 3000;
  private deliveryStatusEnabled = false;
  private outageMode = false;
  private maintenanceMessage: string | null = null;
  private alertThresholds: SmsAlertThresholds | null = { failureWindowMinutes: 30, failureCount: 5 };
  private secretConfigured = true;
  private secretValidated = true;
  private lastRotatedAt = '2026-09-01T07:00:00.000Z';
  private lastTestSendOutcome: SmsSendOutcome = { messageId: 'fixture-msg-1001', status: 'accepted' };
  private lastCheckedAt: string | null = null;
  private readonly idempotency: Map<string, unknown> = new Map();

  constructor(options: SmsSettingsFixtureOptions = {}) {
    this.maskedValue = options.maskedValue ?? '••••••••';
    this.now = options.now ?? (() => Date.now());
    this.secretBackend = options.secretBackend ?? 'writable';
  }

  private snapshot(): SmsSettingsSnapshot {
    return {
      version: this.version,
      updatedAt: this.updatedAt,
      settings: {
        enabled: this.enabled,
        environment: 'development',
        templateId: this.templateId,
        senderLine: this.senderLine,
        timeoutMs: this.timeoutMs,
        deliveryStatusEnabled: this.deliveryStatusEnabled,
        outageMode: this.outageMode,
        maintenanceMessage: this.maintenanceMessage,
        alertThresholds: this.alertThresholds,
      },
      secret: {
        configured: this.secretConfigured,
        masked: this.secretConfigured ? this.maskedValue : null,
        validated: this.secretConfigured && this.secretValidated,
        lastRotatedAt: this.secretConfigured ? this.lastRotatedAt : null,
      },
      secretBackend: this.secretBackend,
    };
  }

  private requireWritableBackend(): void {
    if (this.secretBackend === 'read_only') {
      throw new SmsUnsupportedOperationError(
        'پشتیبان اسرار این محیط فقط‌خواندنی است و امکان تغییر کلید وجود ندارد.',
      );
    }
  }

  private idempotent<T>(key: string, produce: () => T): T {
    if (this.idempotency.has(key)) return this.idempotency.get(key) as T;
    const outcome = produce();
    this.idempotency.set(key, outcome);
    return outcome;
  }

  private touch(): void {
    this.version += 1;
    this.updatedAt = new Date(this.now()).toISOString();
  }

  async getSnapshot(): Promise<SmsSettingsSnapshot> {
    return this.snapshot();
  }

  async update(payload: SmsSettingsUpdatePayload): Promise<SmsSettingsSnapshot> {
    if (payload.expectedVersion !== this.version) {
      throw new SmsVersionConflictError();
    }
    const patch = payload.patch;
    if (patch.enabled !== undefined) this.enabled = patch.enabled;
    if (patch.outageMode !== undefined) this.outageMode = patch.outageMode;
    if (patch.templateId !== undefined) {
      if (patch.templateId !== null && (!Number.isSafeInteger(patch.templateId) || patch.templateId <= 0)) {
        throw new SmsInvalidInputError('شناسهٔ قالب باید یک عدد صحیح مثبت باشد.');
      }
      this.templateId = patch.templateId;
    }
    if (patch.senderLine !== undefined) {
      if (patch.senderLine !== null && patch.senderLine.trim().length === 0) {
        throw new SmsInvalidInputError('خط فرستنده نمی‌تواند خالی باشد.');
      }
      this.senderLine = patch.senderLine;
    }
    if (patch.timeoutMs !== undefined) {
      if (!Number.isInteger(patch.timeoutMs) || patch.timeoutMs < 1 || patch.timeoutMs > 10_000) {
        throw new SmsInvalidInputError('مهلت درخواست باید بین ۱ تا ۱۰۰۰۰ میلی‌ثانیه باشد.');
      }
      this.timeoutMs = patch.timeoutMs;
    }
    if (patch.deliveryStatusEnabled !== undefined) this.deliveryStatusEnabled = patch.deliveryStatusEnabled;
    if (patch.maintenanceMessage !== undefined) this.maintenanceMessage = patch.maintenanceMessage;
    if (patch.alertThresholds !== undefined) this.alertThresholds = patch.alertThresholds;
    this.touch();
    return this.snapshot();
  }

  async rotateSecret(payload: SmsSettingsRotateSecretPayload): Promise<SmsSettingsSnapshot> {
    this.requireWritableBackend();
    if (!payload.confirm) {
      throw new SmsInvalidInputError('برای چرخش کلید، تأیید صریح لازم است.');
    }
    if (typeof payload.secret !== 'string' || payload.secret.trim().length === 0) {
      throw new SmsInvalidInputError('کلید جدید نمی‌تواند خالی باشد.');
    }
    return this.idempotent(payload.idempotencyKey, () => {
      this.secretConfigured = true;
      this.secretValidated = true;
      this.lastRotatedAt = new Date(this.now()).toISOString();
      this.touch();
      return this.snapshot();
    }) as SmsSettingsSnapshot;
  }

  async clearSecret(payload: SmsSettingsClearSecretPayload): Promise<SmsSettingsSnapshot> {
    this.requireWritableBackend();
    if (!payload.confirm) {
      throw new SmsInvalidInputError('برای پاک‌سازی کلید، تأیید صریح لازم است.');
    }
    return this.idempotent(payload.idempotencyKey, () => {
      this.secretConfigured = false;
      this.secretValidated = false;
      this.lastRotatedAt = '';
      this.touch();
      return this.snapshot();
    }) as SmsSettingsSnapshot;
  }

  async testSend(payload: SmsSettingsTestSendPayload): Promise<SmsSendOutcome> {
    if (!payload.confirm) {
      throw new SmsInvalidInputError('برای ارسال آزمایشی، تأیید صریح لازم است.');
    }
    return this.idempotent(payload.idempotencyKey, () => {
      const outcome: SmsSendOutcome =
        this.outageMode || !this.secretConfigured
          ? { messageId: null, status: 'unavailable' }
          : { messageId: `fixture-msg-${this.version}`, status: 'accepted' };
      this.lastTestSendOutcome = outcome;
      return outcome;
    }) as SmsSendOutcome;
  }

  async validate(): Promise<SmsValidation> {
    this.lastCheckedAt = new Date(this.now()).toISOString();
    return {
      checked: true,
      providerHealth: this.secretConfigured ? 'ok' : 'not_configured',
      lastCheckedAt: this.lastCheckedAt,
      errorClass: null,
    };
  }

  async diagnostics(): Promise<SmsDiagnostics> {
    return {
      providerHealth: this.secretConfigured ? (this.outageMode ? 'down' : 'ok') : 'not_configured',
      circuitState: this.outageMode ? 'open' : 'closed',
      lastSuccessfulSendAt:
        this.lastTestSendOutcome.status === 'accepted' ? new Date(this.now()).toISOString() : null,
      lastErrorClass: this.outageMode ? 'provider_error' : null,
    };
  }
}

export function createSmsSettingsFixture(options: SmsSettingsFixtureOptions = {}): SmsSettingsPort {
  return new SmsSettingsFixture(options);
}