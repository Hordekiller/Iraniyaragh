#!/usr/bin/env node
/**
 * Runtime asset policy for the storefront.
 *
 * Mirrors the admin panel policy: the web shell must not reference any remote
 * asset at runtime. Vazirmatn is self-hosted as a variable woff2 (see
 * public/fonts/) and no `https?://` reference or remote CSS `@import` may be
 * shipped in built output sources.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = ['src', 'public', 'index.html'];
const REMOTE_URL = /https?:\/\//;
const REMOTE_CSS_IMPORT = /@import\s+url\([^)]*\/\//;
const BINARY_EXT = new Set(['woff2', 'woff', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif']);
const LEGAL_TXT = /(?:^|\/)(OFL\.txt|LICEN[CS]E.*|NOTICE.*|COPYING.*)$/i;

function isLegalText(file) {
  return LEGAL_TXT.test(file);
}

/**
 * XML namespace URIs (e.g. xmlns="http://www.w3.org/2000/svg" in SVG assets)
 * are identifiers, not runtime fetch targets, so they are stripped before the
 * remote URL check. Legal license texts (OFL.txt) are shipped for attribution
 * and are never fetched at runtime.
 */
function contentToInspect(file, content) {
  if (isLegalText(file)) return '';
  return content.replace(/xmlns(?::\w+)?="(?:https?:\/\/[^"]*)"/g, '');
}

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

const violations = [];
for (const root of ROOTS) {
  const target = fileURLToPath(new URL(`../${root}`, import.meta.url));
  for (const file of collectFiles(target)) {
    if (BINARY_EXT.has(file.split('.').pop().toLowerCase())) continue;
    const content = contentToInspect(file, readFileSync(file, 'utf8'));
    if (REMOTE_URL.test(content)) violations.push(`  - ${file}: remote URL reference`);
    if (REMOTE_CSS_IMPORT.test(content)) violations.push(`  - ${file}: remote CSS @import`);
  }
}

if (violations.length > 0) {
  console.error('Runtime asset policy violations:');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Runtime asset policy passed: no remote asset references found.');