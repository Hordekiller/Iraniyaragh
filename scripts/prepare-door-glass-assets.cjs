const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sharp = require(require.resolve('sharp', { paths: [path.join(root, 'apps/api')] }));
(async () => {
 const source = path.join(root, 'assets/door-glass/sample-grid.png');
 const catalog = JSON.parse(await fs.readFile(path.join(root, 'apps/api/scripts/decofix-catalog/manifest.json'), 'utf8'));
 const bytes = await fs.readFile(source);
 const { width, height } = await sharp(bytes).metadata();
 const manifest = { kind: 'synthetic-demonstration-only', sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), files: {} };
 for (let i = 0; i < catalog.colors.length; i++) {
  const color = catalog.colors[i], col = i % 4, row = Math.floor(i / 4);
  const left = Math.round(col * width / 4), top = Math.round(row * height / 4);
  const output = await sharp(bytes).extract({ left, top, width: Math.round((col + 1) * width / 4) - left, height: Math.round((row + 1) * height / 4) - top }).resize(240, 240).webp({ quality: 85 }).toBuffer();
  const filename = `${color.key}.webp`;
  manifest.files[filename] = { sha256: crypto.createHash('sha256').update(output).digest('hex'), bytes: output.length, width: 240, height: 240 };
  for (const app of ['web', 'admin']) {
   const target = path.join(root, `apps/${app}/public/door-glass-samples`, filename);
   if (process.argv.includes('--check')) { if (!(await fs.readFile(target)).equals(output)) throw Error('Sample derivative differs'); }
   else { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, output); }
  }
 }
 const target = path.join(root, 'assets/door-glass/manifest.json'), text = JSON.stringify(manifest, null, 2) + '\n';
 if (process.argv.includes('--check')) { if (await fs.readFile(target, 'utf8') !== text) throw Error('Sample manifest differs'); }
 else await fs.writeFile(target, text);
 console.log('16 synthetic glass samples verified in both apps.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
