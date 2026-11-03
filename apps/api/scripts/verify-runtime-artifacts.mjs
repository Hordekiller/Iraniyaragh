#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
  // This workspace exports unbuilt TypeScript. A value import can pass tsc and
  // Vitest while crashing the compiled Node application before Nest starts.
  const runtimeContractImport = /\brequire\(\s*(['"])@iranyaragh\/contracts\1\s*\)/u;
  for (const file of files) {
    if (String(file).endsWith('.js') && runtimeContractImport.test(readFileSync(join(root, file), 'utf8'))) {
      throw new Error('Unbuilt contracts runtime dependency');
    }
  }
  console.log('API runtime artifact boundary PASS: entries present; no compiled tests/test-runner configuration.');
} catch {
  console.error('API runtime artifact boundary FAILED: missing entry, compiled test/configuration artifact, or unbuilt contracts runtime dependency.');
  process.exitCode = 1;
}
