import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Locates and invokes scripts/nginx-routing-proxy.sh.
 *
 * Shared by global-setup and global-teardown so the two cannot disagree about
 * which harness they drive.
 *
 * The path is resolved against the working directory rather than `import.meta`,
 * because this package is CommonJS (`import.meta` is a syntax error here) and
 * Playwright may load the config from either the package directory or the
 * repository root depending on how the suite was invoked.
 */
const harnessPath = (): string => {
  const candidates = [
    join(process.cwd(), 'scripts/nginx-routing-proxy.sh'),
    join(process.cwd(), 'e2e/scripts/nginx-routing-proxy.sh'),
  ];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(`Could not find the nginx routing harness. Looked in:\n  ${candidates.join('\n  ')}`);
  }
  return found;
};

export const runHarness = (mode: 'start' | 'stop'): void => {
  execFileSync('bash', [harnessPath(), mode], { stdio: 'inherit' });
};