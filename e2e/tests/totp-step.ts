import { homedir } from 'node:os';
import { join } from 'node:path';
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const TOTP_STEP_MS = 30_000;
const FRESH_WINDOW_MS = 3_000;

/**
 * Playwright re-imports the module registry for every test file *and* every
 * project, so an in-memory counter cannot coordinate sign-ins across the
 * desktop and mobile runs. The reservation therefore lives in one stable file
 * shared by every test process and every back-to-back invocation.
 *
 * The file must never live at a predictable path inside the shared
 * world-writable `/tmp`: another local user could pre-create a symlink there
 * and have our write land in their target (CodeQL `js/insecure-temporary-file`
 * flags exactly that pattern). Instead it lives under the current user's
 * private cache directory (`XDG_CACHE_HOME`, default `~/.cache`), where no
 * other local user can plant anything; the leaf is still verified to be a real
 * directory, and every write goes through an atomic rename, so even a hostile
 * `XDG_CACHE_HOME` cannot redirect the write into a symlink target. Stale
 * content is self-healing: step numbers grow with time, so an old reservation
 * is simply smaller than the current step and ignored. The repository itself
 * stays clean because nothing is written next to the sources.
 */
function reservationPaths(): { target: string; staging: string } {
  const cacheBase = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  const dir = join(cacheBase, 'iranyaragh-e2e');
  mkdirSync(dir, { recursive: true });
  if (!lstatSync(dir).isDirectory()) {
    throw new Error(`Refusing to use ${dir} as a TOTP reservation directory: not a real directory.`);
  }
  return { target: join(dir, 'totp-step.json'), staging: join(dir, `totp-step.${process.pid}.json`) };
}

function readReservedStep(): number | null {
  try {
    const parsed = JSON.parse(readFileSync(reservationPaths().target, 'utf8')) as { step?: unknown };
    return typeof parsed.step === 'number' && Number.isSafeInteger(parsed.step) ? parsed.step : null;
  } catch {
    return null;
  }
}

function writeReservedStep(step: number): void {
  const { target, staging } = reservationPaths();
  writeFileSync(staging, JSON.stringify({ step }));
  renameSync(staging, target);
}

/**
 * The API accepts each TOTP step exactly once per credential:
 * `TotpCredential.lastAcceptedStep` is advanced with a compare-and-swap, so the
 * same 30-second window can never complete a second sign-in. Confirmed against
 * a running API: the first `POST /auth/staff/totp/verify` in a window returns a
 * session and the next two return `401 AUTH_CHALLENGE_INVALID`, even though
 * their challenges were just issued and their codes are current.
 *
 * Every suite signs in as the same provisioned staff identity, so one run needs
 * many sign-ins and would otherwise race its own replay protection. This
 * reserves the next usable step: it waits only when the current window was
 * already handed out, and keeps the code far enough from the boundary that it
 * cannot expire mid-request. The security behaviour is left untouched; only the
 * test timing adapts to it.
 */
export async function waitForFreshTotpStep(): Promise<void> {
  const now = Date.now();
  const currentStep = Math.floor(now / TOTP_STEP_MS);
  const reserved = readReservedStep();
  const step = reserved !== null && currentStep <= reserved ? currentStep + 1 : currentStep;
  writeReservedStep(step);

  const target = step * TOTP_STEP_MS + FRESH_WINDOW_MS;
  const waitMs = target - now;
  if (waitMs <= 0) return;
  await new Promise((resolve) => {
    setTimeout(resolve, waitMs);
  });
}
