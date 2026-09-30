#!/usr/bin/env node
/**
 * Runtime fixture-integrity policy for the storefront build.
 *
 * The storefront ships a hand-authored fixture catalog for local dev / e2e only
 * (`VITE_FIXTURE_CATALOG=true`). It must never reach a production bundle: a
 * bundled fixture is an "implicit fixture" even when the runtime branch that
 * would read it is statically false, because the fake products, prices and
 * category counts still ship to every visitor.
 *
 * The catalog/auth providers therefore reach fixture modules through a dynamic
 * `import()`, which Rollup only emits into the output graph when the flag is
 * actually baked in. This script asserts that outcome on the real build output
 * instead of trusting the bundler.
 *
 * Usage:
 *   node scripts/check-bundle-fixtures.mjs                  # production build: no fixtures
 *   node scripts/check-bundle-fixtures.mjs --expect fixtures # explicit fixture build: fixtures required
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const BINARY_EXT = new Set(['woff2', 'woff', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif']);
const EXPECT_FIXTURES = process.argv.includes('--expect');

/**
 * Markers that only exist inside `src/services/catalog/fixture-data.ts` /
 * `auth/fixture-*`. A handful of independent needles is used so that renaming
 * one fixture row cannot silently disable the guard.
 */
const FIXTURE_MARKERS = [
  'ronix-2210-hammer-drill',
  'bosch-gws-750-grinder',
  'hans-24pc-socket-set',
  'catalog/fixture-data',
  'fixture-user-otp-1',
];

function collectFiles(target) {
  const stat = statSync(target);
  if (!stat.isDirectory()) return [target];
  const files = [];
  for (const entry of readdirSync(target)) {
    const full = join(target, entry);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full));
    else files.push(full);
  }
  return files;
}

let built;
try {
  built = statSync(DIST).isDirectory();
} catch {
  built = false;
}

if (!built) {
  console.error('Fixture-integrity policy could not run: apps/web/dist does not exist.');
  console.error('Run this check as part of `pnpm build` (after `vite build`).');
  process.exit(1);
}

const violations = [];
let found = false;
for (const file of collectFiles(DIST)) {
  if (BINARY_EXT.has(file.split('.').pop().toLowerCase())) continue;
  const content = readFileSync(file, 'utf8');
  for (const marker of FIXTURE_MARKERS) {
    if (content.includes(marker)) {
      found = true;
      if (!EXPECT_FIXTURES) violations.push(`  - ${file}: fixture marker "${marker}"`);
    }
  }
}

if (violations.length > 0) {
  console.error('Runtime fixture-integrity policy violations (fixture data reached the production bundle):');
  console.error(violations.join('\n'));
  process.exit(1);
}

if (EXPECT_FIXTURES && !found) {
  console.error('Fixture build requested, but no fixture catalog data is present in dist.');
  console.error('Check that `.env.fixture-e2e` still sets VITE_FIXTURE_CATALOG=true.');
  process.exit(1);
}

console.log(
  EXPECT_FIXTURES
    ? 'Fixture build check passed: fixture catalog data is present as expected.'
    : 'Runtime fixture-integrity policy passed: no fixture catalog data in the production bundle.',
);
