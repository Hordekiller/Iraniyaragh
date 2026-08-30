import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['src', 'public'];
const scannedExtensions = new Set(['.css', '.html', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const forbidden = [
  { label: 'remote URL literal', pattern: /https?:\/\// },
  { label: 'Google-hosted Next.js font', pattern: /next\/font\/google/ },
  { label: 'remote CSS import', pattern: /@import\s+url\([^)]*\/\// },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (scannedExtensions.has(extname(entry.name))) files.push(path);
  }

  return files;
}

const violations = [];

for (const root of roots) {
  for (const file of await walk(root)) {
    const content = await readFile(file, 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(content)) violations.push(`${file}: ${rule.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('External runtime asset policy violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Runtime asset policy passed: no remote asset references found.');
}
