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
      idempotencyKey: 'rotate-2026-09-08-a1',
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
      fixture.rotateSecret({ secret: 'x', confirm: false, idempotencyKey: 'rotate-reject-1' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(
      fixture.rotateSecret({ secret: '  ', confirm: true, idempotencyKey: 'rotate-reject-2' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(
      fixture.rotateSecret({ secret: ' padded-secret-xxxxxxxx ', confirm: true, idempotencyKey: 'rotate-reject-3' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
    await expect(
      fixture.rotateSecret({ secret: 'secret-with-tab\txxxxxxxx', confirm: true, idempotencyKey: 'rotate-reject-4' }),
    ).rejects.toBeInstanceOf(SmsInvalidInputError);
  });

  it('replays the exact same rotate/clear call idempotently per key', async () => {
    const fixture = makeFixture();
    const first = await fixture.rotateSecret({ secret: 'fresh-api-key-1', confirm: true, idempotencyKey: 'rotate-replay-a1' });
    const replay = await fixture.rotateSecret({ secret: 'fresh-api-key-1', confirm: true, idempotencyKey: 'rotate-replay-a1' });
    expect(replay).toEqual(first);
    expect(replay.version).toBe(first.version);

    const cleared = await fixture.clearSecret({ confirm: true, idempotencyKey: 'clear-replay-b1' });
    const clearedReplay = await fixture.clearSecret({ confirm: true, idempotencyKey: 'clear-replay-b1' });
    expect(clearedReplay).toEqual(cleared);
  });

  it('rejects an idempotency key outside the API grammar before any lookup or effect', async () => {
    const fixture = makeFixture();
    const invalidKeys = [
      'r', 'r4', 'c1', 't1', 'short-1', 'sevench', 'a b-cde-fghi', 'dot.key-1', 'slash/key-1',
      'x'.repeat(97), 'e\u0301'.repeat(8), 'key-\u2028-seg',
    ];
    for (const idempotencyKey of invalidKeys) {
      await expect(
        fixture.rotateSecret({ secret: 'rotate-grammar-a-0001', confirm: true, idempotencyKey }),
      ).rejects.toBeInstanceOf(SmsInvalidInputError);
    }
    await expect(fixture.clearSecret({ confirm: true, idempotencyKey: 'badclr' })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
    await expect(fixture.testSend({ confirm: true, idempotencyKey: 'badtst' })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
    expect((await fixture.getSnapshot()).version).toBe(3);
    await expect(
      fixture.rotateSecret({ secret: 'rotate-grammar-b-0002', confirm: true, idempotencyKey: 'rotate-grammar-ok-0001' }),
    ).resolves.toMatchObject({ version: 4 });
  });

  it('accepts grammar boundary keys of exactly 8 and 96 characters', async () => {
    const fixture = makeFixture();
    const shortest = 'rotd-202';
    const longest = `rotx-${'x'.repeat(91)}`;
    const rotated = await fixture.rotateSecret({ secret: 'rotate-boundary-a-01', confirm: true, idempotencyKey: shortest });
    expect(rotated.version).toBe(4);
    await expect(fixture.clearSecret({ confirm: true, idempotencyKey: longest })).resolves.toMatchObject({
      secret: { configured: false },
    });
  });

  it('rejects an out-of-grammar key used on a read_only backend instead of reporting unsupported', async () => {
    const fixture = makeFixture(true);
    await expect(fixture.rotateSecret({ secret: 'x', confirm: true, idempotencyKey: 'bad' })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
  });

  it('rejects reusing a key for a different secret payload (rotate a then rotate b)', async () => {
    const fixture = makeFixture();
    await fixture.rotateSecret({ secret: 'fresh-api-key-a', confirm: true, idempotencyKey: 'rotate-conflict-0001' });
    await expect(
      fixture.rotateSecret({ secret: 'fresh-api-key-b', confirm: true, idempotencyKey: 'rotate-conflict-0001' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
  });

  it('does not mistake two different secrets for one payload under the old digest collision', async () => {
    const fixture = makeFixture();
    // Deterministic pair that collides under the removed 32-bit DJB2
    // `hashText`: both '1014a' and '73ajbgi' produced the digest `hb90da8c`.
    // Under the SHA-256 fingerprint they differ, so reusing the same key with
    // the second secret must be rejected as a conflict instead of silently
    // returning the first secret's stored outcome.
    await fixture.rotateSecret({ secret: '1014a', confirm: true, idempotencyKey: 'collision-fingerprint-0001' });
    await expect(
      fixture.rotateSecret({ secret: '73ajbgi', confirm: true, idempotencyKey: 'collision-fingerprint-0001' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
  });

  it('rejects reusing a key across different operations', async () => {
    const fixture = makeFixture();
    await fixture.rotateSecret({ secret: 'fresh-api-key-x', confirm: true, idempotencyKey: 'cross-op-reuse-0001' });
    await expect(
      fixture.clearSecret({ confirm: true, idempotencyKey: 'cross-op-reuse-0001' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
    await expect(
      fixture.testSend({ confirm: true, idempotencyKey: 'cross-op-reuse-0001' }),
    ).rejects.toBeInstanceOf(SmsIdempotencyConflictError);
  });

  it('clears the secret and then reports not_configured for validation and diagnostics', async () => {
    const fixture = makeFixture();
    const cleared = await fixture.clearSecret({ confirm: true, idempotencyKey: 'clear-not-conf-0002' });
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
      fixture.rotateSecret({ secret: 'x', confirm: true, idempotencyKey: 'read-only-rotate-0009' }),
    ).rejects.toBeInstanceOf(SmsUnsupportedOperationError);
    await expect(fixture.clearSecret({ confirm: true, idempotencyKey: 'read-only-clear-0009' })).rejects.toBeInstanceOf(
      SmsUnsupportedOperationError,
    );
  });

  it('test-send requires confirm, returns accepted evidence, and is idempotent', async () => {
    const fixture = makeFixture();
    await expect(fixture.testSend({ confirm: false, idempotencyKey: 'test-send-flow-0001' })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );

    const outcome = await fixture.testSend({ confirm: true, idempotencyKey: 'test-send-flow-0001' });
    expect(outcome).toEqual({ messageId: 'fixture-msg-3', status: 'accepted' });
    const replay = await fixture.testSend({ confirm: true, idempotencyKey: 'test-send-flow-0001' });
    expect(replay).toEqual(outcome);
  });

  it('reflects outage mode in the test send and diagnostics', async () => {
    const fixture = makeFixture();
    await fixture.update({ expectedVersion: 3, patch: { outageMode: true } });

    const outcome = await fixture.testSend({ confirm: true, idempotencyKey: 'test-outage-0002' });
    expect(outcome).toEqual({ messageId: null, status: 'unavailable' });

    const diagnostics = await fixture.diagnostics();
    expect(diagnostics.providerHealth).toBe('down');
    expect(diagnostics.circuitState).toBe('open');
    expect(diagnostics.lastErrorClass).toBe('provider_error');
  });

  it('records a successful send timestamp in diagnostics after an accepted test send', async () => {
    const fixture = makeFixture();
    await fixture.testSend({ confirm: true, idempotencyKey: 'test-diagnostics-0003' });
    const diagnostics = await fixture.diagnostics();
    expect(diagnostics.lastSuccessfulSendAt).toBe(new Date(nowMs).toISOString());
    expect(diagnostics.circuitState).toBe('closed');
  });
});