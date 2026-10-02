import { assertSpecProjectOwnership } from './spec-ownership';
import { runHarness } from './nginx-harness';

/**
 * Starts the real nginx vhost for the routing project.
 *
 * Deliberately not a Playwright `webServer` entry: webServer skips its command
 * when the URL already answers, and it terminates the process with SIGKILL,
 * which no trap can catch. A container left behind that way then blocks the next
 * run outright and, worse, keeps serving the previous run's routing. The harness
 * clears stale containers on start, so this path self-heals instead.
 */
export default function globalSetup(): void {
  assertSpecProjectOwnership();
  runHarness('start');
}
