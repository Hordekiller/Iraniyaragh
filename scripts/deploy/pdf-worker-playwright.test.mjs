import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Playwright only launches the browser revision it was released with. A package
// bump without the matching base image builds and starts cleanly, then fails
// every render with RENDER_UNAVAILABLE on the deployed host.
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the PDF worker base image matches the playwright package the API runs', () => {
  const version = JSON.parse(read('apps/api/package.json')).dependencies.playwright;
  assert.match(version, /^\d+\.\d+\.\d+$/, 'playwright must stay pinned to an exact version');
  const base = read('infrastructure/docker/pdf.Dockerfile').match(/^FROM mcr\.microsoft\.com\/playwright:v([\d.]+)-noble@sha256:[0-9a-f]{64} AS runtime$/m);
  assert.ok(base, 'the runtime stage must use a digest-pinned Playwright image');
  assert.equal(base[1], version);
});

test('the PDF worker runs Chromium sandboxed under its seccomp profile', () => {
  assert.match(read('apps/api/src/modules/invoices/invoice-pdf-render.processor.ts'), /chromium\.launch\(\{[^}]*chromiumSandbox: true/);
  assert.match(read('infrastructure/docker/compose.staging.yml'), /pdf-render-worker:[\s\S]*?security_opt:\s+- seccomp=\$\{PDF_SECCOMP_PROFILE:-\/opt\/iranyaragh\/infrastructure\/docker\/chromium-seccomp\.json\}/);
  const profile = JSON.parse(read('infrastructure/docker/chromium-seccomp.json'));
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
});
