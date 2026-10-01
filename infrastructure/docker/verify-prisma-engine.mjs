#!/usr/bin/env node
// Fails the image build unless the Prisma query engine for this image's actual
// OpenSSL major version is present in the deployed node_modules tree.
//
// Why this exists: `prisma generate` shells out to `openssl version`. When that
// binary is missing, Prisma does not fail, it logs a warning and generates for
// openssl-1.1.x anyway. The image then builds cleanly and only fails once a
// request touches the database, with an error that points at schema.prisma
// rather than at the missing tooling:
//
//   Prisma Client could not locate the Query Engine for runtime
//   "debian-openssl-3.0.x". ... generated for "debian-openssl-1.1.x"
//
// So this check resolves the engine the same way Prisma does, and turns a
// runtime crash loop into a build failure.

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function findLibsslMajor() {
  const libDirs = [
    '/usr/lib/x86_64-linux-gnu',
    '/usr/lib/aarch64-linux-gnu',
    '/usr/lib',
    '/lib/x86_64-linux-gnu',
  ];
  for (const dir of libDirs) {
    if (!existsSync(dir)) continue;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = /^libssl\.so\.(\d+)(?:\.(\d+))?$/.exec(entry);
      if (match) return Number(match[1]);
    }
  }
  return null;
}

const major = findLibsslMajor();
if (major === null) {
  throw new Error(
    'No libssl.so.N found in the standard library directories, so the OpenSSL ' +
      'major version this image will use is unknown. Prisma cannot pick a ' +
      'matching engine, so refusing to build rather than shipping an image ' +
      'that will crash on its first database query.',
  );
}

// Prisma names the target after the OpenSSL major version, always as
// debian-openssl-<major>.0.x (3 -> 3.0.x, 1.1 -> 1.1.x).
const expectedTarget = `debian-openssl-${major === 1 ? '1.1' : `${major}.0`}.x`;
const engineFile = `libquery_engine-${expectedTarget}.so.node`;

// Locate the generated client directory the way Prisma does. Prisma resolves
// the engine relative to the `runtime` directory inside @prisma/client and
// walks up three levels, which lands on the .pnpm store path that `pnpm deploy`
// produces:
//
//   <store>/@prisma+client@<ver>/node_modules/@prisma/client/runtime
//   -> <store>/@prisma+client@<ver>/node_modules/.prisma/client
let prismaDir;
try {
  prismaDir = resolve(
    dirname(require.resolve('@prisma/client')),
    '..',
    '..',
    '.prisma',
    'client',
  );
} catch (error) {
  throw new Error(`@prisma/client is not resolvable: ${error.message}`);
}

if (!existsSync(prismaDir)) {
  throw new Error(
    `The generated Prisma client directory is missing at ${prismaDir}. ` +
      'The build must copy the generated client into the deployed tree.',
  );
}

const enginePath = join(prismaDir, engineFile);
if (!existsSync(enginePath)) {
  const present = readdirSync(prismaDir).filter((name) =>
    name.startsWith('libquery_engine'),
  );
  throw new Error(
    'The Prisma query engine for this image is missing.\n' +
    `  expected: ${enginePath}\n` +
    `  present:  ${present.length > 0 ? present.join(', ') : '(none)'}\n` +
    `This image runs OpenSSL ${major}, so prisma generate must have run with ` +
    'the openssl binary available in the build stage. Install it before ' +
    'generating, otherwise Prisma silently generates for a different ' +
    'OpenSSL and the container crash-loops on the first database query.',
  );
}

console.log(
  `prisma engine ok: ${engineFile} (OpenSSL ${major}) at ${prismaDir}`,
);
