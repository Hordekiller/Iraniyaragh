import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const infrastructure = fileURLToPath(new URL('../../infrastructure/docker/', import.meta.url));
const before = '1111111111111111111111111111111111111111';
const after = '2222222222222222222222222222222222222222';

// Exercise the real Compose env_file/interpolation precedence, offline. These
// synthetic SHA values and the public example environment start no containers,
// read no private host configuration and contact no provider or sales database.
for (const [name, recorded, selected] of [
  ['upgrade', before, after],
  ['rollback', after, before],
]) {
  test(`${name}: runtime provenance equals the exact selected image despite the prior deployment record`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'iranyaragh-compose-provenance-'));
    try {
      copyFileSync(join(infrastructure, 'compose.staging.yml'), join(directory, 'compose.yml'));
      copyFileSync(join(infrastructure, '.env.staging.example'), join(directory, '.env.staging'));
      appendFileSync(join(directory, '.env.staging'), `\nIMAGE_TAG=${recorded}\nAPP_VERSION=${recorded}\n`);
      let configuration;
      try {
        configuration = JSON.parse(execFileSync('docker', [
          'compose', '--env-file', join(directory, '.env.staging'),
          '-f', join(directory, 'compose.yml'), 'config', '--format', 'json',
        ], {
          encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
          env: { PATH: process.env.PATH, HOME: process.env.HOME, IMAGE_TAG: selected },
          stdio: ['ignore', 'pipe', 'pipe'],
        }));
      } catch {
        assert.fail('Offline Compose validation failed; Docker Compose is required. No raw configuration is printed.');
      }
      for (const service of ['api', 'media-worker', 'migrate', 'media-bucket', 'admin', 'web']) {
        const value = configuration.services[service];
        assert.ok(value.image.endsWith(`:${selected}`), `${service}: exact image`);
        assert.equal(value.environment.IMAGE_TAG, selected, `${service}: runtime tag`);
        assert.equal(value.environment.APP_VERSION, selected, `${service}: diagnostic version`);
      }
      assert.equal(configuration.services.api.environment.PAYMENT_PROVIDER_MODE, 'disabled');
      assert.equal(configuration.services.api.environment.SMS_PROVIDER_MODE, 'disabled');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
