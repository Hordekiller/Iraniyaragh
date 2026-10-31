#!/usr/bin/env node
/**
 * Runtime asset policy for the storefront.
 *
 * The web shell stays self-hosted except for the operator-approved Enamad
 * verification image in SiteFooter. Vazirmatn is self-hosted (see
 * public/fonts/) and no `https?://` reference or remote CSS `@import` may be
 * shipped in built output sources.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentToInspect } from './runtime-asset-content.mjs';

const ROOTS = ['src', 'public', 'index.html'];
const REMOTE_URL_SRC = /https?:\/\/[^\s"'<>)\]}]*/g;
const REMOTE_CSS_IMPORT = /@import\s+url\([^)]*\/\//;
const BINARY_EXT = new Set(['woff2', 'woff', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif']);

/**
 * Outbound links are user navigation, not runtime asset fetches (navigating
 * to an `<a href>` happens only on click and never ships a resource request
 * from the page itself). These domains are permitted as link destinations
 * only; anything else must stay self-hosted so the page issues zero remote
 * resource requests.
 */
const NAVIGATION_ONLY_DOMAINS = ['instagram.com'];

// These exact, public seal URLs were supplied by the operator. This exception
// is scoped to the footer; other hosts, paths, seals and source files stay denied.
const ENAMAD_FOOTER_URLS = new Set([
  'https://trustseal.enamad.ir/?id=8119011&Code=rwTZwxgkNaMb5nO8mWJkYJWzTIGgPpV3',
  'https://trustseal.enamad.ir/logo.aspx?id=8119011&Code=rwTZwxgkNaMb5nO8mWJkYJWzTIGgPpV3',
]);
const ENAMAD_FOOTER_FILE = fileURLToPath(new URL('../src/components/layout/SiteFooter.tsx', import.meta.url));

function remoteUrls(file, content) {
  const matches = [];
  const re = new RegExp(REMOTE_URL_SRC.source, 'g');
  let match = null;
  while ((match = re.exec(content)) !== null) {
    if (file === ENAMAD_FOOTER_FILE && ENAMAD_FOOTER_URLS.has(match[0])) continue;
    if (!NAVIGATION_ONLY_DOMAINS.some(domain => match[0].includes(domain))) {
      matches.push(match[0]);
    }
  }
  return matches;
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

function isTestSource(file) {
  return file.includes('/src/test/') || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

const violations = [];
for (const root of ROOTS) {
  const target = fileURLToPath(new URL(`../${root}`, import.meta.url));
  for (const file of collectFiles(target)) {
    if (isTestSource(file)) continue;
    if (BINARY_EXT.has(file.split('.').pop().toLowerCase())) continue;
    const content = contentToInspect(file, readFileSync(file, 'utf8'));
    for (const url of remoteUrls(file, content)) {
      violations.push(`  - ${file}: remote asset URL reference (${url})`);
    }
    if (REMOTE_CSS_IMPORT.test(content)) violations.push(`  - ${file}: remote CSS @import`);
  }
}

if (violations.length > 0) {
  console.error('Runtime asset policy violations:');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Runtime asset policy passed: only the approved Enamad footer seal may be remote.');
