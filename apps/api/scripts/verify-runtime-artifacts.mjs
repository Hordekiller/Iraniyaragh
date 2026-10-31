#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const forbidden = /(?:^|\/)(?:__tests__|test|testing)(?:\/|$)|\.(?:integration-spec|spec|test)\.|(?:^|\/)vitest(?:\.integration)?\.config\./u;

try {
  for (const entry of ['src/main.js', 'src/media-worker.js']) {
    if (!statSync(join(root, entry)).isFile()) throw new Error('Missing runtime entry');
  }
  const files = readdirSync(root, { recursive: true });
  if (files.some(path => forbidden.test(String(path).replaceAll('\\', '/')))) {
    throw new Error('Non-runtime artifacts');
  }
  const runtimeRequire = createRequire(join(root, 'src/main.js'));
  const diagnostics = runtimeRequire('@iranyaragh/contracts');
  if (typeof diagnostics.diagnosticException !== 'function'
      || diagnostics.diagnosticId('runtime-check') !== 'runtime-check'
      || diagnostics.adminDiagnosticOperation('POST', '/api/v1/catalog/admin/products')?.operation !== 'catalog.product.create'
      || !Object.values(diagnostics.API_ERROR_CODES).includes('INVALID_REQUEST')) {
    throw new Error('Missing runtime diagnostic exports');
  }
  console.log('API runtime artifact boundary PASS: entries present, CommonJS diagnostics load, no compiled tests/test-runner configuration.');
} catch {
  console.error('API runtime artifact boundary FAILED: expected entry missing or compiled test/configuration artifacts present.');
  process.exitCode = 1;
}
