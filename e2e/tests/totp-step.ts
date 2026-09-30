import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOTP_STEP_MS = 30_000;
const FRESH_WINDOW_MS = 3_000;

/**
 * Playwright re-imports the module registry for every test file *and* every
 * project, so an in-memory counter cannot coordinate sign-ins across the
 * desktop and mobile runs. The reservation therefore lives in the OS temp
 * directory, where every test process in the run can see it and the repository
 * stays clean.
 */
const RESERVATION_FILE = join(tmpdir(), 'iranyaragh-e2e-totp-step.json');

function readReservedStep(): number | null {
  try {
    const parsed = JSON.parse(readFileSync(RESERVATION_FILE, 'utf8')) as { step?: unknown };
    return typeof parsed.step === 'number' && Number.isSafeInteger(parsed.step) ? parsed.step : null;
  } catch {
    return null;
  }
}

function writeReservedStep(step: number): void {
  writeFileSync(RESERVATION_FILE, JSON.stringify({ step }));
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
