import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisconnectedSmsSettingsStore } from './sms-settings.disconnected';
import type { SmsSettingsStore } from './sms-settings.port';
import { SmsSettingsService } from './sms-settings.service';

const DELTA_KEY = 'rotate-2026-09-08-a1';

const DEFAULT_SNAPSHOT: SmsSettingsSnapshot = {
  version: 3,
  updatedAt: '2026-09-08T00:00:00.000Z',
  settings: {
    enabled: true,
    environment: 'production',
    templateId: 1_000_001,
    senderLine: '30007220',
    timeoutMs: 5_000,
    deliveryStatusEnabled: true,
    outageMode: false,
    maintenanceMessage: null,
    alertThresholds: { failureWindowMinutes: 15, failureCount: 5 },
  },
  secret: {
    configured: true,
    masked: '••••••••1234',
    validated: true,
    lastRotatedAt: '2026-09-01T00:00:00.000Z',
  },
  secretBackend: 'writable',
};

function createFakeStore(snapshot: SmsSettingsSnapshot = DEFAULT_SNAPSHOT) {
  let state = snapshot;
  const store = {
    read: vi.fn(async () => state),
    update: vi.fn(async (input: { expectedVersion: number; patch: Record<string, unknown> }) => {
      if (input.expectedVersion !== state.version) {
        throw new ConflictException({ code: 'CONFLICT', message: 'Sms settings changed concurrently.' });
      }
      state = {
        ...state,
        version: state.version + 1,
        settings: { ...state.settings, ...(input.patch as Partial<typeof state.settings>) },
      };
      return state;
    }),
    rotateSecret: vi.fn(async () => ({ lastRotatedAt: '2026-09-08T10:00:00.000Z' })),
    clearSecret: vi.fn(async () => ({ clearedAt: '2026-09-08T10:00:00.000Z' })),
    submitTestSend: vi.fn(async () => ({ messageId: 'msg-1', status: 'accepted' as const })),
    validateConfiguration: vi.fn(async () => ({
      checked: true,
      providerHealth: 'ok' as const,
      lastCheckedAt: '2026-09-08T09:30:00.000Z',
      errorClass: null,
    })),
    diagnostics: vi.fn(async () => ({
      providerHealth: 'ok' as const,
      circuitState: 'closed' as const,
      lastSuccessfulSendAt: '2026-09-08T09:00:00.000Z',
      lastErrorClass: null,
    })),
  };
  return { store: store as unknown as SmsSettingsStore, mutate: (next: SmsSettingsSnapshot) => (state = next) };
}

function build(
  snapshot?: SmsSettingsSnapshot,
  auditRecord = vi.fn(async () => undefined),
) {
  const { store, mutate } = createFakeStore(snapshot);
  const audit = { record: auditRecord };
  const service = new SmsSettingsService(store as unknown as SmsSettingsStore, audit as never);
  const ctx = { actorUserId: 'actor-1', requestId: 'req-1' };
  return { service, store, audit, ctx, mutate };
}

describe('SmsSettingsService', () => {
  let b: ReturnType<typeof build>;

  beforeEach(() => {
    b = build();
  });

  it('reads a snapshot that never exposes the raw secret', async () => {
    const response = await b.service.getSettings();
    const raw = JSON.stringify(response);
    expect(raw).not.toContain('0123456789abcdef');
    expect(raw).toContain('••••');
    expect(b.store.read).toHaveBeenCalledOnce();
  });

  it('reports the secret status surface', async () => {
    const response = await b.service.getSecretStatus();
    expect(response.data.snapshot.secret.configured).toBe(true);
    expect(JSON.stringify(response)).not.toContain('0123456789abcdef');
  });

  it('passes expectedVersion and the patch through to the store', async () => {
    await b.service.updateSettings(b.ctx, { expectedVersion: 3, patch: { enabled: false, timeoutMs: 3_000 } });
    expect(b.store.update).toHaveBeenCalledWith(
      { expectedVersion: 3, patch: { enabled: false, timeoutMs: 3_000 } },
      'req-1',
    );
  });

  it('normalizes empty clearable fields to null and drops unknown fields', async () => {
    await b.service.updateSettings(b.ctx, {
      expectedVersion: 3,
      patch: { senderLine: '', maintenanceMessage: '', environment: 'production' } as never,
    });
    expect(b.store.update).toHaveBeenCalledWith(
      { expectedVersion: 3, patch: { senderLine: null, maintenanceMessage: null } },
      'req-1',
    );
  });

  it('records attempt-then-outcome audit entries with changed field names only', async () => {
    await b.service.updateSettings(b.ctx, { expectedVersion: 3, patch: { timeoutMs: 3_000 } });
    const calls = b.audit.record.mock.calls.map(call => call[0] as { action: string; after?: unknown });
    expect(calls).toEqual([
      expect.objectContaining({ action: 'sms-settings.updated.attempt' }),
      expect.objectContaining({
        action: 'sms-settings.updated.outcome',
        actorId: 'actor-1',
        entityType: 'SmsSettings',
        requestId: 'req-1',
        after: { outcome: 'success', fields: ['timeoutMs'], expectedVersion: 3 },
      }),
    ]);
  });

  it('propagates a stable conflict envelope for stale optimistic updates', async () => {
    await expect(b.service.updateSettings(b.ctx, { expectedVersion: 2, patch: { enabled: false } })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires explicit confirmation to rotate the secret', async () => {
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: false, idempotencyKey: DELTA_KEY }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(b.store.rotateSecret).not.toHaveBeenCalled();
  });

  it('rotates with the idempotency key and audits without returning the secret', async () => {
    const response = await b.service.rotateSecret(b.ctx, {
      secret: '0123456789abcdef',
      confirm: true,
      idempotencyKey: DELTA_KEY,
    });
    expect(b.store.rotateSecret).toHaveBeenCalledWith('0123456789abcdef', DELTA_KEY, 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.attempt',
        metadata: { idempotencyKey: DELTA_KEY },
      }),
    );
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.outcome',
        metadata: { idempotencyKey: DELTA_KEY },
        after: { outcome: 'success', lastRotatedAt: '2026-09-08T10:00:00.000Z' },
      }),
    );
    expect(JSON.stringify(response)).not.toContain('0123456789abcdef');
  });

  it('rejects rotation and clearing on a read-only environment-backed secret store', async () => {
    b.mutate({ ...DEFAULT_SNAPSHOT, secretBackend: 'read_only' });
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toMatchObject({ response: { code: 'OPERATION_UNSUPPORTED' } });
    await expect(b.service.clearSecret(b.ctx, { confirm: true, idempotencyKey: 'clear-1' })).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    expect(b.store.rotateSecret).not.toHaveBeenCalled();
    expect(b.store.clearSecret).not.toHaveBeenCalled();
  });

  it('clears the secret with the idempotency key and records an audit event', async () => {
    await b.service.clearSecret(b.ctx, { confirm: true, idempotencyKey: 'clear-1' });
    expect(b.store.clearSecret).toHaveBeenCalledWith('clear-1', 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sms-settings.secret.cleared.attempt', metadata: { idempotencyKey: 'clear-1' } }),
    );
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.cleared.outcome',
        metadata: { idempotencyKey: 'clear-1' },
        after: { outcome: 'success', clearedAt: '2026-09-08T10:00:00.000Z' },
      }),
    );
  });

  it('validates configuration and audits attempt and outcome only', async () => {
    const response = await b.service.validateConfiguration(b.ctx);
    expect(b.store.validateConfiguration).toHaveBeenCalledWith('req-1', 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sms-settings.validated.attempt' }));
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sms-settings.validated.outcome', after: { outcome: 'success', checked: true, providerHealth: 'ok' } }),
    );
    expect(response.data.validation.checked).toBe(true);
  });

  it('requires explicit confirmation for a controlled test send and never forwards destination input', async () => {
    await expect(
      b.service.sendControlledTest(b.ctx, { confirm: false, idempotencyKey: 'test-1' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const response = await b.service.sendControlledTest(b.ctx, { confirm: true, idempotencyKey: 'test-1' });
    expect(b.store.submitTestSend).toHaveBeenCalledWith('test-1', 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sms-settings.test-send.attempt', metadata: { idempotencyKey: 'test-1' } }),
    );
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.test-send.outcome',
        metadata: { idempotencyKey: 'test-1' },
        after: { outcome: 'success', sendStatus: 'accepted', messageId: 'msg-1' },
      }),
    );
    expect(response.data.outcome.status).toBe('accepted');
  });

  it('returns diagnostics verbatim from the store', async () => {
    const response = await b.service.getDiagnostics();
    expect(response.data.diagnostics.providerHealth).toBe('ok');
    expect(response.data.diagnostics.circuitState).toBe('closed');
  });
});

describe('DisconnectedSmsSettingsStore', () => {
  it('reports an unconfigured snapshot that never claims a production environment', async () => {
    const store = new DisconnectedSmsSettingsStore();
    const snapshot = await store.read();
    expect(snapshot.settings.environment).toBe('unknown');
    expect(snapshot.secretBackend).toBe('read_only');
    expect(snapshot.secret.configured).toBe(false);
  });

  it('fails closed: rotation and clearing are unsupported, other operations are unavailable', async () => {
    const store = new DisconnectedSmsSettingsStore();
    await expect(store.rotateSecret('0123456789abcdef', DELTA_KEY, 'req-1')).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    await expect(store.clearSecret('clear-1', 'req-1')).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    await expect(store.update({ expectedVersion: 0, patch: { enabled: true } }, 'req-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(store.submitTestSend('test-1', 'req-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(store.validateConfiguration('req-1', 'req-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('serves read-only diagnostics without raising', async () => {
    const store = new DisconnectedSmsSettingsStore();
    const diagnostics = await store.diagnostics();
    expect(diagnostics.providerHealth).toBe('not_configured');
  });
});

describe('Audit protocol', () => {
  function buildIdempotentStore() {
    const rotateResults = new Map<string, { lastRotatedAt: string }>();
    const clearResults = new Map<string, { clearedAt: string }>();
    const sendResults = new Map<string, { messageId: string; status: 'accepted' | 'rejected' }>();
    const externalEffects = { rotate: 0, clear: 0, send: 0 };
    return {
      props: externalEffects,
      rotateSecret: vi.fn(async (secret: string, idempotencyKey: string) => {
        if (!rotateResults.has(idempotencyKey)) {
          externalEffects.rotate += 1;
          rotateResults.set(idempotencyKey, { lastRotatedAt: `rotated-${externalEffects.rotate}` });
        }
        return rotateResults.get(idempotencyKey)!;
      }),
      clearSecret: vi.fn(async (idempotencyKey: string) => {
        if (!clearResults.has(idempotencyKey)) {
          externalEffects.clear += 1;
          clearResults.set(idempotencyKey, { clearedAt: `cleared-${externalEffects.clear}` });
        }
        return clearResults.get(idempotencyKey)!;
      }),
      submitTestSend: vi.fn(async (idempotencyKey: string) => {
        if (!sendResults.has(idempotencyKey)) {
          externalEffects.send += 1;
          sendResults.set(idempotencyKey, { messageId: `msg-${externalEffects.send}`, status: 'accepted' as const });
        }
        return sendResults.get(idempotencyKey)!;
      }),
      read: vi.fn(async () => DEFAULT_SNAPSHOT),
      update: vi.fn(async (input: { expectedVersion: number; patch: Record<string, unknown> }) => ({
        ...DEFAULT_SNAPSHOT,
        version: DEFAULT_SNAPSHOT.version + 1,
        settings: { ...DEFAULT_SNAPSHOT.settings, ...(input.patch as Partial<typeof DEFAULT_SNAPSHOT.settings>) },
      })),
      validateConfiguration: vi.fn(async () => ({ checked: true, providerHealth: 'ok' as const, lastCheckedAt: '', errorClass: null })),
    } as unknown as SmsSettingsStore & { props: typeof externalEffects };
  }

  it('pre-attempt audit failure prevents the store dispatch', async () => {
    const auditFailOnAttempt = vi.fn(async () => {
      throw new Error('audit write failure');
    });
    const b = build(DEFAULT_SNAPSHOT, auditFailOnAttempt);
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toThrow('audit write failure');
    expect(b.store.rotateSecret).not.toHaveBeenCalled();
  });

  it('pre-attempt audit failure on clear also prevents dispatch', async () => {
    const auditFailOnAttempt = vi.fn(async () => {
      throw new Error('audit clear failure');
    });
    const b = build(DEFAULT_SNAPSHOT, auditFailOnAttempt);
    await expect(
      b.service.clearSecret(b.ctx, { confirm: true, idempotencyKey: 'clear-2' }),
    ).rejects.toThrow('audit clear failure');
    expect(b.store.clearSecret).not.toHaveBeenCalled();
  });

  it('pre-attest failure on test-send prevents dispatch', async () => {
    const auditFailOnAttempt = vi.fn(async () => {
      throw new Error('audit send failure');
    });
    const b = build(DEFAULT_SNAPSHOT, auditFailOnAttempt);
    await expect(
      b.service.sendControlledTest(b.ctx, { confirm: true, idempotencyKey: 'test-2' }),
    ).rejects.toThrow('audit send failure');
    expect(b.store.submitTestSend).not.toHaveBeenCalled();
  });

  it('pre-attempt audit failure on settings update prevents the store update', async () => {
    const auditFailOnAttempt = vi.fn(async () => {
      throw new Error('audit settings failure');
    });
    const b = build(DEFAULT_SNAPSHOT, auditFailOnAttempt);
    await expect(
      b.service.updateSettings(b.ctx, { expectedVersion: 3, patch: { enabled: false } }),
    ).rejects.toThrow('audit settings failure');
    expect(b.store.update).not.toHaveBeenCalled();
  });

  it('pre-attempt audit failure on validate prevents the store call', async () => {
    const auditFailOnAttempt = vi.fn(async () => {
      throw new Error('audit validation failure');
    });
    const b = build(DEFAULT_SNAPSHOT, auditFailOnAttempt);
    await expect(b.service.validateConfiguration(b.ctx)).rejects.toThrow('audit validation failure');
    expect(b.store.validateConfiguration).not.toHaveBeenCalled();
  });

  it('post-effect audit failure is replay-safe via the same idempotency key with a single external effect', async () => {
    const idempotentStore = buildIdempotentStore();
    let callCount = 0;
    const auditRecord = vi.fn(async () => {
      callCount++;
      if (callCount === 2) throw new Error('audit outcome write failure');
    });
    const service = new SmsSettingsService(idempotentStore, { record: auditRecord } as never);
    const ctx = { actorUserId: 'actor-2', requestId: 'req-outcome-fail' };

    await expect(
      service.sendControlledTest(ctx, { confirm: true, idempotencyKey: 'replay-safe-1' }),
    ).rejects.toThrow('audit outcome write failure');
    expect(idempotentStore.submitTestSend).toHaveBeenCalledTimes(1);
    expect(idempotentStore.props.send).toBe(1);

    const retryResponse = await service.sendControlledTest(ctx, { confirm: true, idempotencyKey: 'replay-safe-1' });
    expect(idempotentStore.submitTestSend).toHaveBeenCalledTimes(2);
    expect(idempotentStore.props.send).toBe(1);
    expect(retryResponse.data.outcome.status).toBe('accepted');
  });

  it('records a failed outcome with the idempotency correlation when rotation is rejected definitively', async () => {
    const b = build();
    b.store.rotateSecret.mockRejectedValueOnce(
      new ConflictException({ code: 'CONFLICT', message: 'A rotation with a conflicting payload already completed.' }),
    );
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.attempt',
        metadata: { idempotencyKey: DELTA_KEY },
      }),
    );
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.outcome',
        metadata: { idempotencyKey: DELTA_KEY },
        after: { outcome: 'failed', errorCode: 'CONFLICT' },
      }),
    );
  });

  it('records an unknown outcome when rotation fails with an upstream-unavailable error and rethrows it', async () => {
    const b = build();
    b.store.rotateSecret.mockRejectedValueOnce(
      new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'provider unreachable' }),
    );
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.outcome',
        metadata: { idempotencyKey: DELTA_KEY },
        after: { outcome: 'unknown', errorClass: 'upstream' },
      }),
    );
  });

  it('records an unknown outcome for a bare store crash on clear and rethrows the original error', async () => {
    const b = build();
    b.store.clearSecret.mockRejectedValueOnce(new Error('connection reset'));
    await expect(
      b.service.clearSecret(b.ctx, { confirm: true, idempotencyKey: 'clear-3' }),
    ).rejects.toThrow('connection reset');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.cleared.outcome',
        metadata: { idempotencyKey: 'clear-3' },
        after: { outcome: 'unknown', errorClass: 'unknown' },
      }),
    );
  });

  it('records a failed outcome for a stale optimistic update and rethrows the conflict', async () => {
    const b = build();
    await expect(
      b.service.updateSettings(b.ctx, { expectedVersion: 1, patch: { enabled: false } }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.updated.outcome',
        after: { outcome: 'failed', errorCode: 'CONFLICT' },
      }),
    );
  });

  it('records the success outcome before the post-effect read and records an unknown read-failure evidence', async () => {
    const b = build();
    b.store.read.mockResolvedValueOnce(DEFAULT_SNAPSHOT).mockRejectedValueOnce(new Error('read unavailable'));
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toThrow('read unavailable');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.outcome',
        after: expect.objectContaining({ outcome: 'success', lastRotatedAt: '2026-09-08T10:00:00.000Z' }),
      }),
    );
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sms-settings.secret.rotated.read-failed',
        metadata: { idempotencyKey: DELTA_KEY },
        after: { outcome: 'unknown', errorClass: 'upstream' },
      }),
    );
  });

  it('never masks the original store error when recording the failure outcome itself fails', async () => {
    let callCount = 0;
    const auditFailAfterAttempt = vi.fn(async () => {
      callCount++;
      if (callCount > 1) throw new Error('audit unavailable');
    });
    const b = build(DEFAULT_SNAPSHOT, auditFailAfterAttempt);
    b.store.rotateSecret.mockRejectedValueOnce(new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'down' }));
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('correlates both attempts of a same-key replay with the same safe idempotency marker', async () => {
    const b = build();
    const first = await b.service.rotateSecret(b.ctx, {
      secret: '0123456789abcdef',
      confirm: true,
      idempotencyKey: DELTA_KEY,
    });
    const second = await b.service.rotateSecret(b.ctx, {
      secret: '0123456789abcdef',
      confirm: true,
      idempotencyKey: DELTA_KEY,
    });
    expect(second.data.snapshot.secret.configured).toBe(first.data.snapshot.secret.configured);
    const calls = b.audit.record.mock.calls
      .map(call => call[0] as { action: string; metadata?: { idempotencyKey?: string } })
      .filter(call => call.action.startsWith('sms-settings.secret.rotated'));
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.metadata).toEqual({ idempotencyKey: DELTA_KEY });
    }
  });
});