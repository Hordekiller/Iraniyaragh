import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./configure-clamav-source.sh', import.meta.url));
const original = [
  'DatabaseDirectory /var/lib/clamav',
  'CVDCertsDirectory /etc/clamav/certs',
  'DatabaseMirror database.clamav.net',
  '#DatabaseMirror old.example.invalid',
  '#PrivateMirror old-private.example.invalid',
  '#HTTPProxyServer old-proxy.example.invalid',
  '#HTTPProxyPort 9000',
  'TestDatabases yes',
  'NotifyClamd /etc/clamav/clamd.conf',
  'ScriptedUpdates yes',
  '',
].join('\n');

function run(environment = {}, repeat = false) {
  const directory = mkdtempSync(join(tmpdir(), 'iranyaragh-clamav-source-'));
  try {
    const config = join(directory, 'freshclam.conf');
    writeFileSync(config, original);
    chmodSync(config, 0o640);
    const invoke = () => spawnSync('sh', [script, config], {
      encoding: 'utf8', env: { PATH: process.env.PATH, ...environment },
    });
    const result = invoke();
    if (repeat && result.status === 0) assert.equal(invoke().status, 0);
    return { ...result, config: readFileSync(config, 'utf8'), mode: statSync(config).mode & 0o777 };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('renders one official HTTPS source and preserves verification/reload settings and file permissions', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.config, /^DatabaseMirror https:\/\/database\.clamav\.net$/m);
  assert.equal(result.config.match(/^DatabaseMirror /gm)?.length, 1);
  assert.doesNotMatch(result.config, /^PrivateMirror |^HTTPProxy/m);
  for (const line of ['CVDCertsDirectory /etc/clamav/certs', 'TestDatabases yes', 'NotifyClamd /etc/clamav/clamd.conf', 'ScriptedUpdates yes']) {
    assert.ok(result.config.includes(`${line}\n`), line);
  }
  assert.equal(result.mode, 0o640);
});

test('replaces the blocked default rather than appending a fallback, idempotently across restarts', () => {
  const result = run({ FRESHCLAM_DATABASE_MIRROR: 'approved.example.invalid' }, true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.config.match(/^DatabaseMirror /gm)?.length, 1);
  assert.match(result.config, /^DatabaseMirror https:\/\/approved\.example\.invalid$/m);
  assert.doesNotMatch(result.config, /database\.clamav\.net|old-private/);
});

test('configures an optional approved CONNECT proxy without changing HTTPS or signature verification', () => {
  const result = run({ FRESHCLAM_PROXY_HOST: 'proxy.example.invalid', FRESHCLAM_PROXY_PORT: '03128' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.config, /^HTTPProxyServer proxy\.example\.invalid$/m);
  assert.match(result.config, /^HTTPProxyPort 3128$/m);
  assert.match(result.config, /^DatabaseMirror https:\/\//m);
  assert.match(result.config, /^TestDatabases yes$/m);
});

test('defaults proxy port only when a proxy host is explicitly configured', () => {
  const result = run({ FRESHCLAM_PROXY_HOST: 'proxy.example.invalid' });
  assert.equal(result.status, 0);
  assert.match(result.config, /^HTTPProxyPort 3128$/m);
  const missingHost = run({ FRESHCLAM_PROXY_PORT: '3128' });
  assert.equal(missingHost.status, 2);
  assert.equal(missingHost.config, original);
});

for (const [index, value] of ['http://insecure.invalid', 'https://example.invalid/path', 'user:private-secret@example.invalid', 'example.invalid\nTestDatabases no', '-example.invalid', 'example..invalid', 'a'.repeat(64) + '.invalid'].entries()) {
  test(`rejects malformed mirror input without changing config or disclosing it (case ${index + 1})`, () => {
    const result = run({ FRESHCLAM_DATABASE_MIRROR: value });
    assert.equal(result.status, 2);
    assert.equal(result.config, original);
    assert.ok(!result.stderr.includes(value));
    assert.doesNotMatch(result.stderr, /private-secret/);
  });
}

test('rejects invalid proxy ports/credentials and conflicting upstream source overrides before writes', () => {
  for (const environment of [
    { FRESHCLAM_PROXY_HOST: 'user:private-secret@proxy.invalid' },
    ...['0', '65536', '99999999999999999', '3128\nTestDatabases no'].map(port => ({ FRESHCLAM_PROXY_HOST: 'proxy.invalid', FRESHCLAM_PROXY_PORT: port })),
    { FRESHCLAM_CONF_DatabaseMirror: 'http://insecure.invalid' },
    { FRESHCLAM_CONF_HTTPProxyPassword: 'private-secret' },
  ]) {
    const result = run(environment);
    assert.equal(result.status, 2);
    assert.equal(result.config, original);
    assert.doesNotMatch(result.stderr, /private-secret/);
  }
});
