import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  SmsDiagnosticsResponse,
  SmsSettingsEditableFields,
  SmsSettingsResponse,
  SmsSettingsUpdatePayload,
  SmsTestSendResponse,
  SmsValidateResponse,
} from '@iranyaragh/contracts';
import { AuditLogService, type AuditEventInput } from '../audit/audit-log.service';
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

const DEFINITIVE_FAILURE_CODES = new Set([
  'CONFLICT',
  'VALIDATION_ERROR',
  'UNPROCESSABLE',
  'OPERATION_UNSUPPORTED',
]);

type StoreFailureClassification =
  | { outcome: 'failed'; errorCode: string }
  | { outcome: 'unknown'; errorClass: 'upstream' | 'unknown' };

function classifyStoreFailure(error: unknown): StoreFailureClassification {
  const code =
    (error as { response?: { code?: unknown } }).response?.code ??
    (error as { code?: unknown }).code;
  if (typeof code === 'string' && DEFINITIVE_FAILURE_CODES.has(code)) {
    return { outcome: 'failed', errorCode: code };
  }
  const errorClass = code === 'UPSTREAM_UNAVAILABLE' ? 'upstream' : 'unknown';
  return { outcome: 'unknown', errorClass };
}

type ActorAndRequest = { actorUserId: string; requestId: string };

function idempotencyAuditMetadata(idempotencyKey: string): Prisma.InputJsonObject {
  return {
    idempotencyKeyHash: createHash('sha256').update(idempotencyKey, 'utf8').digest('hex'),
  };
}

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
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.updated.attempt'),
    );
    let snapshot: Awaited<ReturnType<SmsSettingsStore['update']>>;
    try {
      snapshot = await this.store.update(
        { expectedVersion: input.expectedVersion, patch },
        ctx.requestId,
      );
    } catch (error) {
      await this.recordEffectFailure(ctx, 'sms-settings.updated.outcome', error);
      throw error;
    }
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.updated.outcome', {
        after: {
          outcome: 'success',
          fields: Object.keys(patch),
          expectedVersion: input.expectedVersion,
        },
      }),
    );
    return { data: { snapshot } };
  }

  async rotateSecret(
    ctx: ActorAndRequest,
    input: SmsSettingsRotateSecretDto,
  ): Promise<SmsSettingsResponse> {
    this.assertConfirmed(input.confirm, 'rotate the SMS provider secret');
    await this.assertWritableSecretBackend();
    const idempotencyMetadata = idempotencyAuditMetadata(input.idempotencyKey);
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.secret.rotated.attempt', {
        metadata: idempotencyMetadata,
      }),
    );
    let lastRotatedAt: string;
    try {
      ({ lastRotatedAt } = await this.store.rotateSecret(
        input.secret,
        input.idempotencyKey,
        ctx.requestId,
      ));
    } catch (error) {
      await this.recordEffectFailure(
        ctx,
        'sms-settings.secret.rotated.outcome',
        error,
        idempotencyMetadata,
      );
      throw error;
    }
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.secret.rotated.outcome', {
        metadata: idempotencyMetadata,
        after: { outcome: 'success', lastRotatedAt },
      }),
    );
    let snapshot: Awaited<ReturnType<SmsSettingsStore['read']>>;
    try {
      snapshot = await this.store.read();
    } catch (error) {
      await this.audit.record(
        this.baseRecord(ctx, 'sms-settings.secret.rotated.read-failed', {
          metadata: idempotencyMetadata,
          after: { outcome: 'unknown', errorClass: 'upstream' as const },
        }),
      );
      throw error;
    }
    return { data: { snapshot } };
  }

  async clearSecret(ctx: ActorAndRequest, input: SmsSettingsClearSecretDto): Promise<SmsSettingsResponse> {
    this.assertConfirmed(input.confirm, 'clear the SMS provider secret');
    await this.assertWritableSecretBackend();
    const idempotencyMetadata = idempotencyAuditMetadata(input.idempotencyKey);
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.secret.cleared.attempt', {
        metadata: idempotencyMetadata,
      }),
    );
    let clearedAt: string;
    try {
      ({ clearedAt } = await this.store.clearSecret(input.idempotencyKey, ctx.requestId));
    } catch (error) {
      await this.recordEffectFailure(
        ctx,
        'sms-settings.secret.cleared.outcome',
        error,
        idempotencyMetadata,
      );
      throw error;
    }
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.secret.cleared.outcome', {
        metadata: idempotencyMetadata,
        after: { outcome: 'success', clearedAt },
      }),
    );
    let snapshot: Awaited<ReturnType<SmsSettingsStore['read']>>;
    try {
      snapshot = await this.store.read();
    } catch (error) {
      await this.audit.record(
        this.baseRecord(ctx, 'sms-settings.secret.cleared.read-failed', {
          metadata: idempotencyMetadata,
          after: { outcome: 'unknown', errorClass: 'upstream' as const },
        }),
      );
      throw error;
    }
    return { data: { snapshot } };
  }

  async validateConfiguration(ctx: ActorAndRequest): Promise<SmsValidateResponse> {
    await this.audit.record(this.baseRecord(ctx, 'sms-settings.validated.attempt'));
    let validation: Awaited<ReturnType<SmsSettingsStore['validateConfiguration']>>;
    try {
      validation = await this.store.validateConfiguration(ctx.requestId, ctx.requestId);
    } catch (error) {
      await this.recordEffectFailure(ctx, 'sms-settings.validated.outcome', error);
      throw error;
    }
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.validated.outcome', {
        after: {
          outcome: 'success',
          checked: validation.checked,
          providerHealth: validation.providerHealth,
        },
      }),
    );
    return { data: { validation } };
  }

  async sendControlledTest(ctx: ActorAndRequest, input: SmsSettingsTestSendDto): Promise<SmsTestSendResponse> {
    this.assertConfirmed(input.confirm, 'send a controlled SMS test');
    const idempotencyMetadata = idempotencyAuditMetadata(input.idempotencyKey);
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.test-send.attempt', {
        metadata: idempotencyMetadata,
      }),
    );
    let outcome: Awaited<ReturnType<SmsSettingsStore['submitTestSend']>>;
    try {
      outcome = await this.store.submitTestSend(input.idempotencyKey, ctx.requestId);
    } catch (error) {
      await this.recordEffectFailure(
        ctx,
        'sms-settings.test-send.outcome',
        error,
        idempotencyMetadata,
      );
      throw error;
    }
    await this.audit.record(
      this.baseRecord(ctx, 'sms-settings.test-send.outcome', {
        metadata: idempotencyMetadata,
        after: { outcome: 'success', sendStatus: outcome.status, messageId: outcome.messageId },
      }),
    );
    return { data: { outcome } };
  }

  getDiagnostics(): Promise<SmsDiagnosticsResponse> {
    return this.store.diagnostics().then((diagnostics) => ({ data: { diagnostics } }));
  }

  private baseRecord(
    ctx: ActorAndRequest,
    action: string,
    extra: { after?: Prisma.InputJsonValue; metadata?: Prisma.InputJsonValue } = {},
  ): AuditEventInput {
    return {
      actorId: ctx.actorUserId,
      action,
      entityType: 'SmsSettings',
      entityId: null,
      requestId: ctx.requestId,
      ...(extra.metadata !== undefined ? { metadata: extra.metadata } : {}),
      ...(extra.after !== undefined ? { after: extra.after } : {}),
    };
  }

  private async recordEffectFailure(
    ctx: ActorAndRequest,
    outcomeKey: string,
    error: unknown,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const failure = classifyStoreFailure(error);
    const after =
      failure.outcome === 'failed'
        ? { outcome: 'failed', errorCode: failure.errorCode }
        : { outcome: 'unknown', errorClass: failure.errorClass };
    try {
      await this.audit.record(this.baseRecord(ctx, outcomeKey, { metadata, after }));
    } catch {
      // The original store error must never be masked by an audit-write failure;
      // the caller rethrows it immediately after this call.
    }
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
