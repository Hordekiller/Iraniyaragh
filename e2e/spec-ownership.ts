import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import config from './playwright.config';

/**
 * Asserts that every spec file is claimed by exactly one `testMatch` pattern.
 *
 * `testMatch` is an unanchored regular expression matched against the file path,
 * so a project owning `admin-*.spec.ts` silently also picks up any other file
 * whose name merely *contains* `admin-`. Adding `nginx-admin-routing.spec.ts`
 * therefore ran it three times: once correctly, and twice against the Admin's
 * baseURL, failing for reasons that had nothing to do with routing.
 *
 * The check is per pattern rather than per project, because running one spec in
 * both a desktop and a mobile project is deliberate; what must never happen is a
 * file being claimed by two different patterns, or by none. That failure was
 * visible but misleading, and nothing would have prevented the next collision.
 * The invariant is cheap to state and cheap to check, so it is checked on every
 * run rather than left to be rediscovered.
 */
export function assertSpecProjectOwnership(): void {
  const specs = readdirSync(join(process.cwd(), 'tests')).filter(name => name.endsWith('.spec.ts'));
  const offenders: string[] = [];

  for (const spec of specs) {
    const patterns = new Set(
      config.projects
        .map(project => project.testMatch)
        .filter((pattern): pattern is RegExp => pattern !== undefined)
        .filter(pattern => pattern.test(spec))
        .map(pattern => pattern.source),
    );

    if (patterns.size !== 1) {
      offenders.push(`  ${spec} -> ${patterns.size === 0 ? 'no pattern claims it' : [...patterns].join(' | ')}`);
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      'Every spec file must be claimed by exactly one testMatch pattern, or it runs more than ' +
        'once or not at all:\n' +
        offenders.join('\n'),
    );
  }
}