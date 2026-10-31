import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, statSync, mkdirSync, utimesSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const directory = fileURLToPath(new URL('.', import.meta.url));
const filter = join(directory, 'diagnostic-log-filter.py');
const rows = [{ requestId: 'other', level: 'error' }, { requestId: 'child', correlationId: 'parent', event: 'http.request.completed', level: 'warn' }, { requestId: 'proxy', statusCode: 503 }];
const input = 'plain dependency startup\n' + rows.map(row => JSON.stringify(row)).join('\n') + '\n';
const run = args => execFileSync('python3', [filter, ...args], { input, encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(row => JSON.parse(row));
test('support-code lookup joins child and parent IDs without unrelated logs', () => {
  assert.deepEqual(run(['--request-id', 'parent']), [rows[1]]);
  assert.deepEqual(run(['--request-id', 'child']), [rows[1]]);
  assert.deepEqual(run(['--request-id', 'absent']), []);
});
test('level and event filters include structured proxy failures', () => {
  assert.deepEqual(run(['--level', 'error']), [rows[0], rows[2]]);
  assert.deepEqual(run(['--event', 'http.request.completed']), [rows[1]]);
});
test('oversized/malformed diagnostic lines are bounded and skipped', () => {
  const output = execFileSync('python3', [filter, '--level', 'error'], { input: 'x'.repeat(80000) + '\n{broken}\n' + JSON.stringify(rows[2]), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), rows[2]);
});
test('logs CLI passes bounded history and filtering without follow for -n', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'ir-diagnostic-cli-'));
  try {
    const env = join(temporary, '.env'); const args = join(temporary, 'args.json');
    writeFileSync(env, '# synthetic CLI test; no credentials\n');
    writeFileSync(join(temporary, 'docker'), '#!/usr/bin/env python3\nimport os,json,sys\nopen(os.environ["DIAG_TEST_ARGUMENTS"],"w").write(json.dumps(sys.argv[1:]))\nprint(json.dumps({"requestId":"test-code","level":"error"}))\n');
    chmodSync(join(temporary, 'docker'), 0o700);
    const output = execFileSync('bash', [join(directory, 'logs.sh'), '--request-id', 'test-code', '--since', '2h', '-n', '500', 'api'], { encoding: 'utf8', env: { ...process.env, PATH: temporary + ':' + process.env.PATH, ENV_FILE: env, DIAG_TEST_ARGUMENTS: args } });
    assert.equal(JSON.parse(output).requestId, 'test-code');
    const passed = JSON.parse(readFileSync(args, 'utf8'));
    assert.ok(!passed.includes('--follow'));
    assert.equal(passed[passed.indexOf('--tail') + 1], '500');
    assert.equal(passed[passed.indexOf('--since') + 1], '2h');
    assert.equal(passed.at(-1), 'api');
    assert.equal(spawnSync('bash', [join(directory, 'logs.sh'), '--tail', '50000'], { encoding: 'utf8' }).status, 2);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

import { gunzipSync, gzipSync } from 'node:zlib';
test('archive projection strips bodies, messages and values while preserving failure evidence', () => {
  const row = { timestamp: '2026-10-31T10:00:00Z', event: 'http.request.completed', service: 'iranyaragh-api', requestId: 'synthetic-request', errorCode: 'INVALID_REQUEST', message: 'synthetic-private', body: { password: 'synthetic-private' }, data: { password: 'synthetic-private', statusCode: 400, validation: [{ field: 'name', rules: ['isString'], value: 'synthetic-private' }] } };
  const output = execFileSync('python3', [filter, '--archive-safe'], { input: 'native synthetic-private\n' + JSON.stringify(row) + '\n', encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert.equal(parsed.requestId, 'synthetic-request');
  assert.equal(parsed.data.validation[0].field, 'name');
  assert.ok(!output.includes('synthetic-private'));
});
test('deployment archive is private and compressed', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'ir-diagnostic-archive-'));
  try {
    const env = join(temporary, '.env'); const archives = join(temporary, 'archives');
    writeFileSync(env, '# isolated archive test\n');
    mkdirSync(archives);
    for (let i=0;i<31;i++) writeFileSync(join(archives, `diagnostics-seed-${i}.jsonl.gz`), gzipSync(''));
    const expired = join(archives, 'diagnostics-expired.jsonl.gz');
    writeFileSync(expired, gzipSync(''));
    utimesSync(expired, new Date(0), new Date(0));
    writeFileSync(join(temporary, 'docker'), '#!/usr/bin/env python3\nimport json\nprint(json.dumps({"event":"http.request.completed","requestId":"archive-test","message":"synthetic-private","data":{"statusCode":422,"password":"synthetic-private"}}))\n');
    chmodSync(join(temporary, 'docker'), 0o700);
    execFileSync('bash', [join(directory, 'archive-diagnostics.sh')], { env: { ...process.env, ENV_FILE: env, DIAGNOSTIC_ARCHIVE_DIR: archives, PATH: temporary + ':' + process.env.PATH }, stdio: 'pipe' });
    const files = readdirSync(archives).filter(file => file.endsWith('.jsonl.gz'));
    assert.equal(files.length, 30);
    assert.ok(!files.includes('diagnostics-expired.jsonl.gz'));
    assert.equal(statSync(archives).mode & 0o777, 0o700);
    const file = join(archives, files.find(name => !name.includes('seed')));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const content = gunzipSync(readFileSync(file)).toString();
    assert.equal(JSON.parse(content).requestId, 'archive-test');
    assert.ok(!content.includes('synthetic-private'));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
