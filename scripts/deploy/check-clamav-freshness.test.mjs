import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./check-clamav-freshness.sh', import.meta.url));

// The script shells out to `docker compose exec ... sigtool`. These tests stub a
// fake `docker` on PATH that prints synthetic `sigtool --info` output, so the
// age parsing and the pass/fail decision are exercised without Docker, a real
// ClamD service, network access or any signature file.
function run({ sigtoolOutput, maxAgeDays, nowEpoch }) {
  const directory = mkdtempSync(join(tmpdir(), 'iranyaragh-clamav-freshness-'));
  try {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    const fakeDocker = join(bin, 'docker');
    writeFileSync(fakeDocker, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat <<\'EOF\'',
      sigtoolOutput,
      'EOF',
    ].join('\n'));
    chmodSync(fakeDocker, 0o755);
    writeFileSync(join(directory, '.env.staging'), 'COMPOSE_PROJECT_NAME=iranyaragh\n');

    return spawnSync('bash', [script, ...(maxAgeDays == null ? [] : [String(maxAgeDays)])], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: process.env.HOME,
        ENV_FILE: join(directory, '.env.staging'),
        ...(nowEpoch ? { CLAMAV_NOW_EPOCH: String(nowEpoch) } : {}),
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Fixed build and "now" epochs keep both the parsing and the staleness decision
// deterministic regardless of the machine clock.
const builtEpoch = Math.floor(Date.parse('2026-10-20T06:24:00Z') / 1000);
const fresh = ['File: /var/lib/clamav/daily.cvd', 'Build time: 20 Oct 2026 06:24 +0000', 'Version: 28138', 'Verification OK.'].join('\n');
const daysLater = (days) => builtEpoch + days * 86400;

test('fails when the loaded signatures are older than the limit', () => {
  const result = run({ sigtoolOutput: fresh, maxAgeDays: 6, nowEpoch: daysLater(10) });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /stale/i);
  assert.doesNotMatch(result.stderr, /Build time: 20 Oct 2026/);
});

test('passes when the signatures are within the limit', () => {
  const result = run({ sigtoolOutput: fresh, maxAgeDays: 7, nowEpoch: daysLater(2) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /freshness OK/);
});

test('reports unavailable rather than passing when signature info cannot be read', () => {
  const result = run({ sigtoolOutput: '', maxAgeDays: 7, nowEpoch: daysLater(1) });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /could not read ClamAV signature info/);
});

test('rejects a non-numeric age limit without touching the deployment', () => {
  const result = run({ sigtoolOutput: fresh, maxAgeDays: 'week' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /whole number/);
});
