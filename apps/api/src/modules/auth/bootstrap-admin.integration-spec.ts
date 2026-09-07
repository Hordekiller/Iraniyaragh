import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { generate } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';

const API_ROOT = join(__dirname, '..', '..', '..');
const BOOT_SCRIPT = join(API_ROOT, 'scripts', 'bootstrap-admin.mjs');
const BOOT_PASSWORD = 'bootstrap-S3cret-2026!';
const DEV_ADMIN_EMAIL = 'dev-admin@iranyaragh.local';

const bootstrapEnvReady =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.AUTH_HASH_SECRET) &&
  Boolean(process.env.AUTH_TOTP_ENCRYPTION_KEY);

type BootResult = { code: number | null; output: string };

/**
 * Runs the bootstrap script on a real PTY via util-linux `script`. The child's
 * PTY output is echoed to script's own stdout stream, which `script` flushes in
 * real time (the typescript file is buffered until exit), so prompts are read
 * from the captured stream. The successful TOTP secret is parsed back out of
 * that stream and the matching code is fed to the script.
 */
function runTtyBoot(email: string): Promise<BootResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('script', ['-qec', `node ${BOOT_SCRIPT} --confirm`, '/dev/null'], {
      cwd: API_ROOT,
      env: process.env,
    });

    let captured = '';
    child.stdout.on('data', chunk => {
      captured += String(chunk);
    });
    child.stderr.on('data', chunk => {
      captured += String(chunk);
    });

    const waitFor = (needle: string, timeoutMs = 12_000): Promise<void> =>
      new Promise((resolveWait, rejectWait) => {
        const deadline = Date.now() + timeoutMs;
        const poll = () => {
          if (captured.includes(needle)) return resolveWait();
          if (child.exitCode !== null) return rejectWait(new Error(`Child exited before: ${needle}`));
          if (Date.now() > deadline) return rejectWait(new Error(`Timed out waiting for: ${needle}`));
          setTimeout(poll, 50);
        };
        poll();
      });

    const feeder = (async () => {
      await waitFor('Administrator email: ');
      child.stdin.write(`${email}\n`);
      await waitFor('Password: ');
      child.stdin.write(`${BOOT_PASSWORD}\n`);
      await waitFor('Confirm password: ');
      child.stdin.write(`${BOOT_PASSWORD}\n`);
      await waitFor('Current TOTP code: ');
      // The provisioning URI carries the base32 secret verbatim; the PTY may
      // translate line endings to CRLF, so match the URI query instead of raw lines.
      const secretMatch = captured.match(/secret=([A-Z2-7]+)/u);
      if (!secretMatch) throw new Error('Bootstrap did not print a TOTP secret.');
      const code = await generate({ secret: secretMatch[1] });
      child.stdin.write(`${code}\n`);
      // Close stdin so script sees EOF and can exit once the command finishes;
      // leaving it open backpressures the PTY and prevents 'close'.
      child.stdin.end();
    })();
    feeder.catch(() => undefined);

    child.on('error', error => {
      feeder.catch(() => undefined);
      reject(error);
    });
    child.on('close', code => {
      // Resolve once the underlying node bootstrap has finished and script has
      // flushed its output streams.
      feeder.catch(() => undefined);
      resolve({ code, output: captured });
    });
  });
}

function runTtyWithoutConfirm(): Promise<BootResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('script', ['-qec', `node ${BOOT_SCRIPT}`, '/dev/null'], {
      cwd: API_ROOT,
      env: process.env,
    });
    let captured = '';
    child.stdout.on('data', chunk => {
      captured += String(chunk);
    });
    child.stderr.on('data', chunk => {
      captured += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output: captured }));
  });
}

function runDirectBootstrap(): Promise<BootResult> {
  return new Promise(resolve => {
    execFile(
      'node',
      ['scripts/bootstrap-admin.mjs'],
      { cwd: API_ROOT, env: process.env, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const err = error as NodeJS.ErrnoException | null;
        const code = err && typeof err.code === 'number' ? err.code : 0;
        resolve({ code, output: `${stdout}\n${stderr}` });
      },
    );
  });
}

describe.sequential('bootstrap-admin.mjs provisioning', () => {
  const prisma = new PrismaService();
  let connected = false;
  let systemAdminRoleId: string | null = null;
  let bootstrappedEmails: string[] = [];

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    const role = await prisma.role.findUnique({ where: { key: 'system-admin' }, select: { id: true } });
    systemAdminRoleId = role?.id ?? null;
  });

  afterAll(async () => {
    if (!connected) return;
    await restoreDevAdminRole();
    for (const email of bootstrappedEmails) {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) continue;
      await prisma.auditLog.deleteMany({ where: { entityId: user.id } });
      await prisma.recoveryCode.deleteMany({ where: { totpCredential: { userId: user.id } } });
      await prisma.totpCredential.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    bootstrappedEmails = [];
    await prisma.$disconnect();
  });

  async function devAdminUserId(): Promise<string | null> {
    const devAdmin = await prisma.user.findUnique({ where: { email: DEV_ADMIN_EMAIL }, select: { id: true } });
    return devAdmin?.id ?? null;
  }

  async function setDevAdminRole(active: boolean): Promise<void> {
    const userId = await devAdminUserId();
    if (!userId || !systemAdminRoleId) throw new Error('Seeded dev-admin or system-admin role is missing.');
    await prisma.userRole.updateMany({
      where: { userId, roleId: systemAdminRoleId },
      data: active
        ? { revokedAt: null, revokedById: null, revokeReason: null }
        : { revokedAt: new Date(), revokedById: null, revokeReason: 'integration-test' },
    });
  }

  async function restoreDevAdminRole(): Promise<void> {
    try {
      await setDevAdminRole(true);
    } catch {
      // dev-admin may not exist in this environment; nothing to restore.
    }
  }

  async function clearLeftoverBootstraps(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: 'bootstrap-' } },
      select: { id: true },
    });
    for (const user of users) {
      await prisma.auditLog.deleteMany({ where: { entityId: user.id } });
      await prisma.recoveryCode.deleteMany({ where: { totpCredential: { userId: user.id } } });
      await prisma.totpCredential.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }

  async function countActiveSystemAdmins(): Promise<number> {
    if (!systemAdminRoleId) return 0;
    return prisma.userRole.count({ where: { roleId: systemAdminRoleId, revokedAt: null } });
  }

  beforeEach(async () => {
    if (!connected) return;
    await clearLeftoverBootstraps();
  });

  it('refuses to run outside an interactive TTY even when unresolved inputs are provided', async () => {
    const { code, output } = await runDirectBootstrap();
    expect(code).not.toBe(0);
    expect(output).toContain('First-admin bootstrap requires an interactive TTY and the explicit --confirm flag.');
  });

  it('refuses TTY runs without the --confirm flag', async () => {
    const { code, output } = await runTtyWithoutConfirm();
    expect(code).not.toBe(0);
    expect(output).toContain('First-admin bootstrap requires an interactive TTY and the explicit --confirm flag.');
  });

  it.skipIf(!bootstrapEnvReady)('refuses when an active system-admin already exists', async () => {
    await setDevAdminRole(true);
    expect(await countActiveSystemAdmins()).toBeGreaterThan(0);
    const removedEmail = `bootstrap-refuse-${randomUUID().slice(0, 8)}@example.com`;
    const { code, output } = await runTtyBoot(removedEmail);
    expect(code).not.toBe(0);
    expect(output).toContain('bootstrap refuses replacement');
    await expect(prisma.user.findUnique({ where: { email: removedEmail } })).resolves.toBeNull();
  });

  it.skipIf(!bootstrapEnvReady)('bootstraps a new system-admin when none is active', async () => {
    await setDevAdminRole(false);
    try {
      expect(await countActiveSystemAdmins()).toBe(0);
      const bootEmail = `bootstrap-new-${randomUUID().slice(0, 8)}@example.com`;
      const { code, output } = await runTtyBoot(bootEmail);
      expect(code).toBe(0);
      expect(output).toContain('Bootstrap complete');

      const user = await prisma.user.findUniqueOrThrow({ where: { email: bootEmail } });
      expect(user.status).toBe('ACTIVE');
      expect(user.passwordHash).not.toBeNull();
      const credential = await prisma.totpCredential.findUniqueOrThrow({ where: { userId: user.id } });
      expect(credential.confirmedAt).not.toBeNull();
      await expect(prisma.recoveryCode.count({ where: { totpCredentialId: credential.id } })).resolves.toBe(10);
      const assignment = await prisma.userRole.findFirstOrThrow({
        where: { userId: user.id, roleId: systemAdminRoleId! },
      });
      expect(assignment.revokedAt).toBeNull();
      expect(await countActiveSystemAdmins()).toBe(1);
      bootstrappedEmails.push(bootEmail);
      await prisma.userRole.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date(), revokeReason: 'integration-test' },
      });
    } finally {
      // Leave dev-admin (and the just-created admin) revoked so the next test
      // starts with zero active system-admins; afterAll restores dev-admin.
      await setDevAdminRole(false).catch(() => undefined);
    }
  });

  it.skipIf(!bootstrapEnvReady)('allows exactly one concurrent bootstrap under the advisory lock', async () => {
    await setDevAdminRole(false);
    const candidateEmails = [
      `bootstrap-a-${randomUUID().slice(0, 8)}@example.com`,
      `bootstrap-b-${randomUUID().slice(0, 8)}@example.com`,
    ];
    try {
      expect(await countActiveSystemAdmins()).toBe(0);
      const results = await Promise.all([runTtyBoot(candidateEmails[0]), runTtyBoot(candidateEmails[1])]);
      const successes = results.filter(result => result.code === 0 && result.output.includes('Bootstrap complete'));
      const refusals = results.filter(result => result.code !== 0 && result.output.includes('bootstrap refuses replacement'));
      expect(successes).toHaveLength(1);
      expect(refusals).toHaveLength(1);
      expect(await countActiveSystemAdmins()).toBe(1);
      for (const email of candidateEmails) {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (user) {
          bootstrappedEmails.push(email);
          await prisma.userRole.updateMany({
            where: { userId: user.id },
            data: { revokedAt: new Date(), revokeReason: 'integration-test' },
          });
        }
      }
    } finally {
      // Leave dev-admin (and any winning bootstrap user) revoked so later runs
      // start clean; afterAll restores dev-admin.
      await setDevAdminRole(false).catch(() => undefined);
    }
  });
});