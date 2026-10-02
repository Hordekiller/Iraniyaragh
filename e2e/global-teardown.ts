import { runHarness } from './nginx-harness';

/**
 * Stops the nginx container started in global-setup.
 *
 * Runs even when the suite fails, which is what keeps a red run from leaving a
 * container behind for the next one. `stop` is idempotent and ignores a container
 * that is already gone.
 */
export default function globalTeardown(): void {
  runHarness('stop');
}
