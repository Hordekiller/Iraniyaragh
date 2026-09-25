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
const REMOTE_URL_SRC = /https?:\/\/[^\s"'<>)\]}]*/g;
const REMOTE_CSS_IMPORT = /@import\s+url\([^)]*\/\//;
const BINARY_EXT = new Set(['woff2', 'woff', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif']);
const LEGAL_TXT = /(?:^|\/)(OFL\.txt|LICEN[CS]E.*|NOTICE.*|COPYING.*)$/i;

/**
 * Outbound links are user navigation, not runtime asset fetches (navigating
 * to an `<a href>` happens only on click and never ships a resource request
 * from the page itself). These domains are permitted as link destinations
 * only; anything else must stay self-hosted so the page issues zero remote
 * resource requests.
 */
const NAVIGATION_ONLY_DOMAINS = ['instagram.com'];

function remoteUrls(content) {
  const matches = [];
  const re = new RegExp(REMOTE_URL_SRC.source, 'g');
  let match = null;
  while ((match = re.exec(content)) !== null) {
    if (!NAVIGATION_ONLY_DOMAINS.some(domain => match[0].includes(domain))) {
      matches.push(match[0]);
    }
  }
  return matches;
}

function isLegalText(file) {
  return LEGAL_TXT.test(file);
}

/**
 * XML namespace URIs (e.g. xmlns="http://www.w3.org/2000/svg" in SVG assets)
 * are identifiers, not runtime fetch targets, so they are stripped before the
 * remote URL check. The same applies to JSON-LD `@context` values (schema.org):
 * structured-data markup embeds the identifier for a data vocabulary the page
 * itself never fetches at runtime. Legal license texts (OFL.txt) are shipped
 * for attribution and are never fetched at runtime.
 */
function contentToInspect(file, content) {
  if (isLegalText(file)) return '';
  const withoutNamespaces = content.replace(/xmlns(?::\w+)?="(?:https?:\/\/[^"]*)"/g, '');
  return withoutNamespaces.replace(/['"]@context['"]\s*:\s*['"]https?:\/\/schema\.org['"]/g, '');
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
  return /(?:^|\/)src\/test\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

const violations = [];
for (const root of ROOTS) {
  const target = fileURLToPath(new URL(`../${root}`, import.meta.url));
  for (const file of collectFiles(target)) {
    if (isTestSource(file)) continue;
    if (BINARY_EXT.has(file.split('.').pop().toLowerCase())) continue;
    const content = contentToInspect(file, readFileSync(file, 'utf8'));
    for (const url of remoteUrls(content)) {
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

console.log('Runtime asset policy passed: no remote asset references found.');
