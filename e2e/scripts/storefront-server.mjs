import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each runtime needs its own Next build because client fixture flags are baked
// into browser chunks. Never launch the real suite from a fixture-built .next.
const mode = process.argv[2];
if (!['fixture', 'real'].includes(mode)) throw new Error('Usage: storefront-server.mjs fixture|real');
const fixture = mode === 'fixture';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const app = join(root, 'apps/web');
const distDir = `.next/e2e-${mode}`;
const output = join(app, distDir);
const standaloneApp = join(output, 'standalone/apps/web');
const port = process.env.STOREFRONT_E2E_PORT || (fixture ? '4173' : '4174');
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid storefront E2E port');
const api = new URL(process.env.STOREFRONT_E2E_API_URL || 'http://127.0.0.1:4000');
if (!['http:', 'https:'].includes(api.protocol) || api.pathname !== '/' || api.search || api.hash || api.username || api.password) {
  throw new Error('STOREFRONT_E2E_API_URL must be a credential-free HTTP(S) origin');
}
const environment = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ENVIRONMENT: 'test',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_DIST_DIR: distDir,
  HOSTNAME: '127.0.0.1',
  PORT: port,
  PUBLIC_WEB_ORIGIN: process.env.PUBLIC_WEB_ORIGIN || 'https://iraniyaragh.example',
  API_INTERNAL_URL: api.origin,
  NEXT_PUBLIC_API_BASE_URL: api.origin,
  VITE_API_BASE_URL: api.origin,
  VITE_FIXTURE_AUTH: String(fixture),
  VITE_FIXTURE_CATALOG: String(fixture),
  NEXT_PUBLIC_FIXTURE_AUTH: String(fixture),
  NEXT_PUBLIC_FIXTURE_CATALOG: String(fixture),
};
// The browser suite asserts the deliberately unconfigured contact state. Keep
// environment files or an operator shell from leaking real details into it.
for (const key of ['SITE_PHONE', 'SITE_POSTAL_CODE', 'SITE_ADDRESS', 'SITE_EMAIL', 'INSTAGRAM_HANDLE']) {
  environment[`NEXT_PUBLIC_${key}`] = '';
  environment[`VITE_${key}`] = '';
}
let activeChild;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => activeChild?.kill(signal));
const run = (command, args, cwd) => new Promise((resolveRun, reject) => {
  activeChild = spawn(command, args, { cwd, env: environment, stdio: 'inherit' });
  activeChild.once('error', reject);
  activeChild.once('exit', (code, signal) => {
    activeChild = undefined;
    if (signal) resolveRun(signal === 'SIGINT' ? 130 : 143);
    else resolveRun(code ?? 1);
  });
});

const buildStatus = await run('pnpm', ['--filter', '@iranyaragh/web', 'build'], root);
if (buildStatus !== 0) process.exit(buildStatus);
const server = join(standaloneApp, 'server.js');
if (!existsSync(server)) throw new Error('Next standalone server was not built');
// Standalone omits browser assets/public by design; mirror the production image
// copies, retaining the monorepo's apps/web path and this build's custom distDir.
mkdirSync(join(standaloneApp, distDir), { recursive: true });
cpSync(join(output, 'static'), join(standaloneApp, distDir, 'static'), { recursive: true });
cpSync(join(app, 'public'), join(standaloneApp, 'public'), { recursive: true });
process.exit(await run(process.execPath, [server], standaloneApp));
