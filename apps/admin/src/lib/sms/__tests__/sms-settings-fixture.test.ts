import { describe, expect, it } from 'vitest';
import {
  SmsIdempotencyConflictError,
  SmsInvalidInputError,
  SmsUnsupportedOperationError,
  SmsVersionConflictError,
} from '../sms-settings-port';
import { SmsSettingsFixture } from '../sms-settings-fixture';

const nowMs = 1_700_000_000_000;

function makeFixture(readOnlySecretBackend = false) {
  return new SmsSettingsFixture({
    now: () => nowMs,
    ...(readOnlySecretBackend ? { secretBackend: 'read_only' as const } : {}),
  });
}

describe('SmsSettingsFixture', () => {
  it('returns a contract-shaped baseline snapshot without ever exposing the secret', async () => {
    const fixture = makeFixture();
    const snapshot = await fixture.getSnapshot();

    expect(snapshot.version).toBe(3);
    expect(snapshot.settings.environment).toBe('development');
    expect(snapshot.secret.configured).toBe(true);
    expect(snapshot.secret.masked).toBe('••••••••');
    expect(snapshot.secret.lastRotatedAt).toBeTruthy();
    expect(JSON.stringify(snapshot)).not.toContain('api-key');
    expect(JSON.stringify(snapshot)).not.toContain('secret-key');
  });

  it('updates only after the expectedVersion compare-and-swap succeeds', async () => {
    const fixture = makeFixture();
    await expect(
      fixture.update({ expectedVersion: 999, patch: { enabled: false } }),
    ).rejects.toBeInstanceOf(SmsVersionConflictError);
    expect((await fixture.getSnapshot()).version).toBe(3);

    await fixture.update({
      expectedVersion: 3,
      patch: { templateId: 778899, timeoutMs: 5000, enabled: false },
    });
    const after = await fixture.getSnapshot();
    expect(after.version).toBe(4);
    expect(after.settings.templateId).toBe(778899);
    expect(after.settings.timeoutMs).toBe(5000);
    expect(after.settings.enabled).toBe(false);
    expect(after.updatedAt).toBe(new Date(nowMs).toISOString());
  });

  it('rejects invalid editable input without mutating state or bumping the version', async () => {
    const fixture = makeFixture();
    await expect(fixture.update({ expectedVersion: 3, patch: { templateId: 0 } })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
    await expect(fixture.update({ expectedVersion: 3, patch: { templateId: -3 } })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
    await expect(fixture.update({ expectedVersion: 3, patch: { timeoutMs: 0 } })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
    await expect(
      fixture.update({ expectedVersion: 3, patch: { timeoutMs: 10_001 } }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(fixture.update({ expectedVersion: 3, patch: { senderLine: '   ' } })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
    expect((await fixture.getSnapshot()).version).toBe(3);
  });

  it('allows clearing the optional template id to null per the contract', async () => {
    const fixture = makeFixture();
    const updated = await fixture.update({ expectedVersion: 3, patch: { templateId: null } });
    expect(updated.settings.templateId).toBeNull();
  });

  it('rotates the secret write-only, keeps masked display and never stores the value', async () => {
    const fixture = makeFixture();
    const rotated = await fixture.rotateSecret({
      secret: 'fresh-api-key',
      confirm: true,
      idempotencyKey: 'rotate-1',
    });
    expect(rotated.version).toBe(4);
    expect(rotated.secret.configured).toBe(true);
    expect(rotated.secret.masked).toBe('••••••••');
    expect(rotated.secret.lastRotatedAt).toBe(new Date(nowMs).toISOString());
    expect(JSON.stringify(rotated)).not.toContain('fresh-api-key');
  });

  it('requires confirm and a non-empty, unpadded secret for rotation', async () => {
    const fixture = makeFixture();
    await expect(
      fixture.rotateSecret({ secret: 'x', confirm: false, idempotencyKey: 'r2' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(
      fixture.rotateSecret({ secret: '  ', confirm: true, idempotencyKey: 'r3' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(
      fixture.rotateSecret({ secret: ' padded-secret-xxxxxxxx ', confirm: true, idempotencyKey: 'r3b' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(
      fixture.rotateSecret({ secret: 'secret-with-tab\txxxxxxxx', confirm: true, idempotencyKey: 'r3c' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
  });

  it('replays the exact same rotate/clear call idempotently per key', async () => {
    const fixture = makeFixture();
    const first = await fixture.rotateSecret({ secret: 'fresh-api-key-1', confirm: true, idempotencyKey: 'r4' });
    const replay = await fixture.rotateSecret({ secret: 'fresh-api-key-1', confirm: true, idempotencyKey: 'r4' });
    expect(replay).toEqual(first);
    expect(replay.version).toBe(first.version);

    const cleared = await fixture.clearSecret({ confirm: true, idempotencyKey: 'c1' });
    const clearedReplay = await fixture.clearSecret({ confirm: true, idempotencyKey: 'c1' });
    expect(clearedReplay).toEqual(cleared);
  });

  it('rejects reusing a key for a different secret payload (rotate a then rotate b)', async () => {
    const fixture = makeFixture();
    await fixture.rotateSecret({ secret: 'fresh-api-key-a', confirm: true, idempotencyKey: 'r-conflict-1' });
    await expect(
      fixture.rotateSecret({ secret: 'fresh-api-key-b', confirm: true, idempotencyKey: 'r-conflict-1' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
  });

  it('rejects reusing a key across different operations', async () => {
    const fixture = makeFixture();
    await fixture.rotateSecret({ secret: 'fresh-api-key-x', confirm: true, idempotencyKey: 'cross-op-1' });
    await expect(
      fixture.clearSecret({ confirm: true, idempotencyKey: 'cross-op-1' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
    await expect(
      fixture.testSend({ confirm: true, idempotencyKey: 'cross-op-1' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
  });

  it('clears the secret and then reports not_configured for validation and diagnostics', async () => {
    const fixture = makeFixture();
    const cleared = await fixture.clearSecret({ confirm: true, idempotencyKey: 'c2' });
    expect(cleared.secret.configured).toBe(false);
    expect(cleared.secret.masked).toBeNull();
    expect(cleared.secret.lastRotatedAt).toBeNull();

    const validation = await fixture.validate();
    expect(validation.providerHealth).toBe('not_configured');
    expect((await fixture.diagnostics()).providerHealth).toBe('not_configured');
  });

  it('answers rotate/clear with OPERATION_UNSUPPORTED on a read_only backend', async () => {
    const fixture = makeFixture(true);
    await expect(
      fixture.rotateSecret({ secret: 'x', confirm: true, idempotencyKey: 'r9' }),
    ).rejects.toBeInstanceOf(SmsUnsupportedOperationError);
    await expect(fixture.clearSecret({ confirm: true, idempotencyKey: 'c9' })).rejects.toBeInstanceOf(
      SmsUnsupportedOperationError,
    );
  });

  it('test-send requires confirm, returns accepted evidence, and is idempotent', async () => {
    const fixture = makeFixture();
    await expect(fixture.testSend({ confirm: false, idempotencyKey: 't1' })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );

    const outcome = await fixture.testSend({ confirm: true, idempotencyKey: 't1' });
    expect(outcome).toEqual({ messageId: 'fixture-msg-3', status: 'accepted' });
    const replay = await fixture.testSend({ confirm: true, idempotencyKey: 't1' });
    expect(replay).toEqual(outcome);
  });

  it('reflects outage mode in the test send and diagnostics', async () => {
    const fixture = makeFixture();
    await fixture.update({ expectedVersion: 3, patch: { outageMode: true } });

    const outcome = await fixture.testSend({ confirm: true, idempotencyKey: 't2' });
    expect(outcome).toEqual({ messageId: null, status: 'unavailable' });

    const diagnostics = await fixture.diagnostics();
    expect(diagnostics.providerHealth).toBe('down');
    expect(diagnostics.circuitState).toBe('open');
    expect(diagnostics.lastErrorClass).toBe('provider_error');
  });

  it('records a successful send timestamp in diagnostics after an accepted test send', async () => {
    const fixture = makeFixture();
    await fixture.testSend({ confirm: true, idempotencyKey: 't3' });
    const diagnostics = await fixture.diagnostics();
    expect(diagnostics.lastSuccessfulSendAt).toBe(new Date(nowMs).toISOString());
    expect(diagnostics.circuitState).toBe('closed');
  });
});