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
      for (const service of ['api', 'media-worker', 'pdf-render-worker', 'migrate', 'media-bucket', 'admin', 'storefront', 'web']) {
        const value = configuration.services[service];
        assert.ok(value.image.endsWith(`:${selected}`), `${service}: exact image`);
        assert.equal(value.environment.IMAGE_TAG, selected, `${service}: runtime tag`);
        assert.equal(value.environment.APP_VERSION, selected, `${service}: diagnostic version`);
      }
      assert.equal(configuration.services.storefront.environment.API_INTERNAL_URL, 'http://api:4000');
      assert.equal(configuration.services.storefront.environment.PUBLIC_WEB_ORIGIN, 'https://iraniyaragh.com');
      assert.equal(configuration.services.storefront.environment.APP_ENVIRONMENT, 'staging');
      assert.equal(configuration.services.storefront.environment.DATABASE_URL, undefined);
      assert.equal(configuration.services.storefront.environment.SMS_IR_API_KEY, undefined);
      assert.equal(configuration.services.storefront.ports, undefined);
      assert.equal(configuration.services.web.depends_on.storefront.condition, 'service_healthy');
      assert.equal(configuration.services.api.environment.PAYMENT_PROVIDER_MODE, 'disabled');
      assert.equal(configuration.services.api.environment.SMS_PROVIDER_MODE, 'disabled');
      // ADR-0030: the worker's provenance is the PDF image, never the API image.
      assert.match(configuration.services['pdf-render-worker'].image, /iranyaragh\/pdf-render-worker:/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
