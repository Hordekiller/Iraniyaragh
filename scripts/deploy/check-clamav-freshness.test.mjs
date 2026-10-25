import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./check-clamav-freshness.sh', import.meta.url));

// The script shells out to `docker compose exec ... clamdscan --version`. Tests
// supply differing on-disk/loaded versions to prove a failed reload cannot pass.
// A fake `docker` on PATH prints synthetic output, so the
// age parsing and the pass/fail decision are exercised without Docker, a real
// ClamD service, network access or any signature file.
function run({ sigtoolOutput = fresh, loadedOutput = loaded, maxAgeDays, nowEpoch, dockerExit = 0 }) {
  const directory = mkdtempSync(join(tmpdir(), 'iranyaragh-clamav-freshness-'));
  try {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    const fakeDocker = join(bin, 'docker');
    writeFileSync(fakeDocker, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf "%s\\n" "$*" >> "$FAKE_DOCKER_CALLS"',
      'case "$*" in',
      '  *clamdscan*) printf "%s\\n" "$FAKE_LOADED_VERSION" ;;',
      '  *sigtool*) printf "%s\\n" "$FAKE_DISK_INFO" ;;',
      '  *) exit 99 ;;',
      'esac',
      'exit "$FAKE_DOCKER_EXIT"',
    ].join('\n'));
    chmodSync(fakeDocker, 0o755);
    writeFileSync(join(directory, '.env.staging'), 'COMPOSE_PROJECT_NAME=iranyaragh\n');

    const callsFile = join(directory, 'docker-calls');
    const result = spawnSync('bash', [script, ...(maxAgeDays == null ? [] : [String(maxAgeDays)])], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: process.env.HOME,
        ENV_FILE: join(directory, '.env.staging'),
        FAKE_DOCKER_CALLS: callsFile,
        FAKE_LOADED_VERSION: loadedOutput,
        FAKE_DISK_INFO: sigtoolOutput,
        FAKE_DOCKER_EXIT: String(dockerExit),
        ...(nowEpoch === undefined ? {} : { CLAMAV_NOW_EPOCH: String(nowEpoch) }),
      },
    });
    return { ...result, calls: existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\n') : [] };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Fixed build and "now" epochs keep both the parsing and the staleness decision
// deterministic regardless of the machine clock.
const builtEpoch = Math.floor(Date.parse('2026-10-20T06:24:00Z') / 1000);
const fresh = ['File: /var/lib/clamav/daily.cvd', 'Build time: 20 Oct 2026 06:24 +0000', 'Version: 28138', 'Verification OK.'].join('\n');
const loaded = 'ClamAV 1.5.4/28138/Tue Oct 20 06:24:00 2026';
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
  const result = run({ sigtoolOutput: '', loadedOutput: '', maxAgeDays: 7, nowEpoch: daysLater(1) });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /could not read ClamAV signature info/);
});

test('fresh files cannot hide stale signatures still loaded by the daemon', () => {
  const result = run({ loadedOutput: 'ClamAV 1.5.4/28137/Mon Sep 28 06:24:12 2026', nowEpoch: daysLater(1) });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /stale/i);
});

test('checks the exact threshold rather than rounding down a stale partial day', () => {
  assert.equal(run({ maxAgeDays: 7, nowEpoch: daysLater(7) }).status, 0);
  const result = run({ maxAgeDays: 7, nowEpoch: daysLater(7) + 1 });
  assert.equal(result.status, 1, result.stdout);
});

test('a future database timestamp is unknown, never fresh', () => {
  const result = run({ nowEpoch: builtEpoch - 1 });
  assert.equal(result.status, 2, result.stdout);
});

test('engine-only fallback and a failed Docker command cannot report freshness', () => {
  assert.equal(run({ loadedOutput: 'ClamAV 1.5.4', nowEpoch: daysLater(1) }).status, 2);
  assert.equal(run({ dockerExit: 2, nowEpoch: daysLater(1) }).status, 2);
});

test('leading-zero limits are decimal and oversized limits are invalid', () => {
  assert.equal(run({ maxAgeDays: '08', nowEpoch: daysLater(9) }).status, 1);
  const invalid = run({ maxAgeDays: '999999999999999999999999' });
  assert.equal(invalid.status, 2);
  assert.deepEqual(invalid.calls, []);
});

test('the only deployment call reads daemon version and never scans or mutates', () => {
  const result = run({ nowEpoch: daysLater(1) });
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 1);
  assert.match(result.calls[0], /exec -T malware-scanner clamdscan --version$/);
  assert.doesNotMatch(result.calls[0], /sigtool|freshclam|--reload|restart|up -d/);
});

test('rejects a non-numeric age limit without touching the deployment', () => {
  const result = run({ sigtoolOutput: fresh, maxAgeDays: 'week' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /whole number/);
});
