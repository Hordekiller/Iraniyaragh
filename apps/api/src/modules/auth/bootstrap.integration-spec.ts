import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import {
  BOOTSTRAP_REFUSAL,
  SYSTEM_ADMIN_ROLE_KEY,
  createFirstAdministrator,
  hashValue,
} from '../../../scripts/bootstrap-admin-core.mjs';

describe.sequential('First-administrator bootstrap database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const prisma = new PrismaService();
  const hashSecret = 'bootstrap-integration-hash-secret-32-bytes-minimum';

  let connected = false;
  let systemAdminRoleId = '';
  const createdUserIds: string[] = [];
  const createdAuditIds: string[] = [];

  function fabricateInput(email: string) {
    return {
      email,
      passwordHash: `argon2-fake-${randomUUID()}`,
      encryptedSecret: `v1:${randomUUID().replaceAll('-', '')}`,
      encryptionKeyVersion: 'v1',
      recoveryCodes: Array.from({ length: 3 }, () => `RECOVERY-${randomUUID()}`),
      hashSecret,
      requestId: `bootstrap-${runId}`,
    };
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    const role = await prisma.role.findUnique({ where: { key: SYSTEM_ADMIN_ROLE_KEY }, select: { id: true } });
    if (!role) throw new Error(`${SYSTEM_ADMIN_ROLE_KEY} role is missing; seed the test database first.`);
    systemAdminRoleId = role.id;

    await prisma.userRole.updateMany({
      where: { roleId: systemAdminRoleId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  afterAll(async () => {
    if (createdAuditIds.length) {
      await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (connected) await prisma.$disconnect();
  });

  it('creates the first administrator and lets exactly one concurrent runner win', async () => {
    const first = fabricateInput(`bootstrap-first-${runId}@example.com`);
    const second = fabricateInput(`bootstrap-second-${runId}@example.com`);

    const [firstResult, secondResult] = await Promise.allSettled([
      createFirstAdministrator({ prisma, ...first }),
      createFirstAdministrator({ prisma, ...second }),
    ]);

    let winner: { status: 'CREATED'; userId: string; recoveryCodes: string[] } | undefined;
    let refusals = 0;
    for (const result of [firstResult, secondResult]) {
      if (result.status === 'fulfilled' && result.value.status === 'CREATED') winner = result.value;
      if (result.status === 'fulfilled' && result.value.status === BOOTSTRAP_REFUSAL) refusals += 1;
    }
    expect(winner).toBeDefined();
    expect(refusals).toBe(1);
    if (!winner) throw new Error('Expected exactly one bootstrap runner to create the administrator.');

    const winnerInput = firstResult.status === 'fulfilled' && firstResult.value.status === 'CREATED' ? first : second;
    createdUserIds.push(winner.userId);

    const activeAdminGrants = await prisma.userRole.findMany({
      where: { roleId: systemAdminRoleId, revokedAt: null },
      select: { userId: true },
    });
    expect(activeAdminGrants).toHaveLength(1);
    expect(activeAdminGrants[0].userId).toBe(winner.userId);

    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: winner.userId } });
    expect(storedUser.passwordHash).toBe(winnerInput.passwordHash);

    const credential = await prisma.totpCredential.findUniqueOrThrow({
      where: { userId: winner.userId },
      select: { recoveryCodes: { select: { codeHash: true } } },
    });
    expect(credential.recoveryCodes.map(code => code.codeHash).sort()).toEqual(winnerInput.recoveryCodes.map(code => hashValue(code, 'recovery-code', hashSecret)).sort());

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.admin.bootstrapped', requestId: `bootstrap-${runId}` },
      select: { id: true, metadata: true },
    });
    expect(audit.metadata).toMatchObject({
      roleId: systemAdminRoleId,
      operator: 'automated-test',
      recoveryCodeCount: 3,
    });
    createdAuditIds.push(audit.id);
  });

  it('refuses to create a replacement once an administrator exists', async () => {
    const attempt = fabricateInput(`bootstrap-later-${runId}@example.com`);
    const outcome = await createFirstAdministrator({ prisma, ...attempt });
    expect(outcome.status).toBe(BOOTSTRAP_REFUSAL);

    const user = await prisma.user.findUnique({ where: { email: attempt.email } });
    expect(user).toBeNull();

    const activeAdminGrants = await prisma.userRole.findMany({
      where: { roleId: systemAdminRoleId, revokedAt: null },
      select: { userId: true },
    });
    expect(activeAdminGrants).toHaveLength(1);
  });
});