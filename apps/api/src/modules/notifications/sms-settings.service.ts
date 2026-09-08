import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type {
  SmsDiagnosticsResponse,
  SmsSettingsEditableFields,
  SmsSettingsResponse,
  SmsSettingsUpdatePayload,
  SmsTestSendResponse,
  SmsValidateResponse,
} from '@iranyaragh/contracts';
import { AuditLogService } from '../audit/audit-log.service';
import type {
  SmsSettingsClearSecretDto,
  SmsSettingsPatchDto,
  SmsSettingsRotateSecretDto,
  SmsSettingsTestSendDto,
} from './sms-settings.dto';
import { SMS_SETTINGS_STORE, type SmsSettingsStore } from './sms-settings.port';

function buildEditablePatch(dto: SmsSettingsPatchDto): Partial<SmsSettingsEditableFields> {
  const patch: Partial<SmsSettingsEditableFields> = {};
  if (dto.enabled !== undefined) patch.enabled = dto.enabled;
  if (dto.templateId !== undefined) patch.templateId = dto.templateId;
  if (dto.senderLine !== undefined) patch.senderLine = dto.senderLine === '' ? null : dto.senderLine;
  if (dto.timeoutMs !== undefined) patch.timeoutMs = dto.timeoutMs;
  if (dto.deliveryStatusEnabled !== undefined) patch.deliveryStatusEnabled = dto.deliveryStatusEnabled;
  if (dto.outageMode !== undefined) patch.outageMode = dto.outageMode;
  if (dto.maintenanceMessage !== undefined) patch.maintenanceMessage = dto.maintenanceMessage === '' ? null : dto.maintenanceMessage;
  if (dto.alertThresholds !== undefined) {
    patch.alertThresholds = dto.alertThresholds
      ? {
          failureWindowMinutes: dto.alertThresholds.failureWindowMinutes,
          failureCount: dto.alertThresholds.failureCount,
        }
      : null;
  }
  return patch;
}

type ActorAndRequest = { actorUserId: string; requestId: string };

@Injectable()
export class SmsSettingsService {
  constructor(
    @Inject(SMS_SETTINGS_STORE) private readonly store: SmsSettingsStore,
    private readonly audit: AuditLogService,
  ) {}

  getSettings(): Promise<SmsSettingsResponse> {
    return this.store.read().then((snapshot) => ({ data: { snapshot } }));
  }

  getSecretStatus(): Promise<SmsSettingsResponse> {
    return this.store.read().then((snapshot) => ({ data: { snapshot } }));
  }

  async updateSettings(
    ctx: ActorAndRequest,
    input: SmsSettingsUpdatePayload,
  ): Promise<SmsSettingsResponse> {
    const patch = buildEditablePatch(input.patch as SmsSettingsPatchDto);
    const snapshot = await this.store.update(
      { expectedVersion: input.expectedVersion, patch },
      ctx.requestId,
    );
    await this.audit.record({
      actorId: ctx.actorUserId,
      action: 'sms-settings.updated',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: ctx.requestId,
      after: { fields: Object.keys(patch), expectedVersion: input.expectedVersion },
    });
    return { data: { snapshot } };
  }

  async rotateSecret(
    ctx: ActorAndRequest,
    input: SmsSettingsRotateSecretDto,
  ): Promise<SmsSettingsResponse> {
    this.assertConfirmed(input.confirm, 'rotate the SMS provider secret');
    await this.assertWritableSecretBackend();
    const { lastRotatedAt } = await this.store.rotateSecret(input.secret, input.idempotencyKey, ctx.requestId);
    const snapshot = await this.store.read();
    await this.audit.record({
      actorId: ctx.actorUserId,
      action: 'sms-settings.secret.rotated',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: ctx.requestId,
      after: { lastRotatedAt },
    });
    return { data: { snapshot } };
  }

  async clearSecret(ctx: ActorAndRequest, input: SmsSettingsClearSecretDto): Promise<SmsSettingsResponse> {
    this.assertConfirmed(input.confirm, 'clear the SMS provider secret');
    await this.assertWritableSecretBackend();
    const { clearedAt } = await this.store.clearSecret(input.idempotencyKey, ctx.requestId);
    const snapshot = await this.store.read();
    await this.audit.record({
      actorId: ctx.actorUserId,
      action: 'sms-settings.secret.cleared',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: ctx.requestId,
      after: { clearedAt },
    });
    return { data: { snapshot } };
  }

  async validateConfiguration(ctx: ActorAndRequest): Promise<SmsValidateResponse> {
    const validation = await this.store.validateConfiguration(ctx.requestId, ctx.requestId);
    await this.audit.record({
      actorId: ctx.actorUserId,
      action: 'sms-settings.validated',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: ctx.requestId,
      after: { checked: validation.checked, providerHealth: validation.providerHealth },
    });
    return { data: { validation } };
  }

  async sendControlledTest(ctx: ActorAndRequest, input: SmsSettingsTestSendDto): Promise<SmsTestSendResponse> {
    this.assertConfirmed(input.confirm, 'send a controlled SMS test');
    const outcome = await this.store.submitTestSend(input.idempotencyKey, ctx.requestId);
    await this.audit.record({
      actorId: ctx.actorUserId,
      action: 'sms-settings.test-send',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: ctx.requestId,
      after: { status: outcome.status, messageId: outcome.messageId },
    });
    return { data: { outcome } };
  }

  getDiagnostics(): Promise<SmsDiagnosticsResponse> {
    return this.store.diagnostics().then((diagnostics) => ({ data: { diagnostics } }));
  }

  private assertConfirmed(confirm: boolean, operation: string): void {
    if (confirm !== true) {
      throw new UnprocessableEntityException({
        code: 'UNPROCESSABLE',
        message: `Explicit confirmation is required to ${operation}.`,
      });
    }
  }

  private async assertWritableSecretBackend(): Promise<void> {
    const snapshot = await this.store.read();
    if (snapshot.secretBackend !== 'writable') {
      throw new UnprocessableEntityException({
        code: 'OPERATION_UNSUPPORTED',
        message: 'Secret rotation and clearing are unavailable for the read-only environment-backed secret store.',
      });
    }
  }
}