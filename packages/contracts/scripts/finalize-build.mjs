import { access, writeFile } from 'node:fs/promises';

// The API runs CommonJS on Node; browser bundlers keep using the typed source.
await access(new URL('../dist/index.js', import.meta.url));
await writeFile(new URL('../dist/package.json', import.meta.url), '{"type":"commonjs"}\n');
